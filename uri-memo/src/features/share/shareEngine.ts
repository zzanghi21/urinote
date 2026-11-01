import { t } from "../../i18n";
import type { NoteColor } from "../../domain/note";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import type { InboxItem, ShareRecord, SharesRepository } from "../../data/local/sharesRepo";
import {
  canEdit,
  MAX_MEMBERS,
  membershipBytes,
  roleOf,
  type Member,
  type Membership,
  type SignedMembership,
} from "./membership";
import { decodeMessage, encodeMessage, type SyncMessage } from "./protocol";

/**
 * Sharing/sync engine (DESIGN.md 4.9.4 – 4.9.7). Exactly one runs, in the hub window.
 *
 * Permission rules (4.9.6) — all based on "the newest member list I know":
 * - document data (sync-step2, update) is accepted only from owner and editor devices
 * - document data is sent only to members, and only when I am owner or editor
 * - a member list is accepted only with a valid owner signature and a higher version
 * The peer's device ID (from) is verified by TLS in the P2P layer.
 */

/** Link to the note and document stores (in the app: NoteService + DocStore + window events) */
export interface NoteBridge {
  info(noteId: string): Promise<{ title: string; color: NoteColor } | null>;
  /** Full document state (Yjs update) */
  docState(noteId: string): Promise<Uint8Array>;
  stateVector(noteId: string): Promise<Uint8Array>;
  /** Diff since a state vector */
  diffSince(noteId: string, stateVector: Uint8Array): Promise<Uint8Array>;
  /** Stores a received update and applies it to open windows. true if my document actually changed */
  applyRemote(noteId: string, update: Uint8Array): Promise<boolean>;
  /** Creates the note on this device from a received share offer */
  adopt(noteId: string, state: Uint8Array, color: NoteColor): Promise<void>;
  /** Marks the note as shared (noteId) or turns it back into a personal note (null) */
  setSpace(noteId: string, spaceId: string | null): Promise<void>;
}

export interface EngineDeps {
  myId: string;
  myName(): string;
  send(peerId: string, message: SyncMessage): Promise<void>;
  connectedPeers(): string[];
  /** base64 signature */
  sign(data: Uint8Array): Promise<string>;
  verify(signer: string, data: Uint8Array, signature: string): Promise<boolean>;
  shares: SharesRepository;
  notes: NoteBridge;
  onChange(): void;
  now?(): number;
}

export interface Invitee {
  id: string;
  name: string;
  role: "editor" | "viewer";
}

/** An empty Yjs update (no changes) is 2 bytes */
const EMPTY_UPDATE_BYTES = 2;

/** Limits on unanswered share offers (total / per sending friend) */
export const MAX_INBOX = 50;
export const MAX_INBOX_PER_PEER = 10;

export class ShareEngine {
  constructor(private readonly deps: EngineDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  // ───────────────────────────── Owner actions ─────────────────────────────

  /** Starts sharing a note, or adds members if already shared. Owner only */
  async share(noteId: string, invitees: Invitee[]) {
    const existing = await this.deps.shares.get(noteId);
    if (existing && existing.status === "active") {
      const m = existing.signed.membership;
      this.assertOwner(m);
      const known = new Set(m.members.map((x) => x.id));
      await this.updateMembers(noteId, [
        ...m.members,
        ...invitees.filter((i) => !known.has(i.id) && i.id !== this.deps.myId),
      ]);
      return;
    }
    const members: Member[] = [
      { id: this.deps.myId, name: this.deps.myName(), role: "owner" },
      ...invitees.filter((i) => i.id !== this.deps.myId),
    ];
    if (members.length > MAX_MEMBERS)
      throw new Error(t("공유 인원은 최대 {max}대입니다", { max: MAX_MEMBERS }));
    const signed = await this.signMembership({
      noteId,
      // restarting an ended share must still produce a newer version than the old "ended" list
      version: (existing?.signed.membership.version ?? 0) + 1,
      owner: this.deps.myId,
      status: "active",
      members,
      issuedAt: this.now(),
    });
    await this.deps.shares.save({ noteId, signed, status: "active" });
    await this.deps.notes.setSpace(noteId, noteId);
    for (const invitee of members.slice(1)) await this.sendOffer(invitee.id, signed);
    this.deps.onChange();
  }

  /** Changes member permissions or removes members. Signs a new member-list version and tells everyone */
  async updateMembers(noteId: string, members: Member[]) {
    const record = await this.requireShare(noteId);
    const old = record.signed.membership;
    this.assertOwner(old);
    if (members.length > MAX_MEMBERS)
      throw new Error(t("공유 인원은 최대 {max}대입니다", { max: MAX_MEMBERS }));
    const next = await this.signMembership({
      ...old,
      version: old.version + 1,
      members: [
        old.members.find((x) => x.role === "owner")!,
        ...members.filter((x) => x.role !== "owner" && x.id !== old.owner),
      ],
      issuedAt: this.now(),
    });
    await this.deps.shares.save({ ...record, signed: next });

    const before = new Set(old.members.map((x) => x.id));
    const after = new Set(next.membership.members.map((x) => x.id));
    for (const m of next.membership.members) {
      if (!before.has(m.id)) await this.sendOffer(m.id, next);
    }
    for (const id of before) {
      if (!after.has(id)) await this.deps.shares.dropQueued(id, noteId, "offer");
    }
    // also tell removed devices so they show "removed from the share"
    await this.broadcastMembership(next, [...before, ...after]);
    this.deps.onChange();
  }

  /** The owner ends sharing. The record is kept to tell members met later that it ended */
  async end(noteId: string) {
    const record = await this.requireShare(noteId);
    const old = record.signed.membership;
    this.assertOwner(old);
    const next = await this.signMembership({
      ...old,
      version: old.version + 1,
      status: "ended",
      issuedAt: this.now(),
    });
    await this.deps.shares.save({ noteId, signed: next, status: "ended" });
    await this.deps.notes.setSpace(noteId, null);
    await this.broadcastMembership(
      next,
      next.membership.members.map((x) => x.id),
    );
    this.deps.onChange();
  }

  // ───────────────────────────── Member actions ─────────────────────────────

  async acceptOffer(noteId: string) {
    const item = (await this.deps.shares.inbox()).find((i) => i.noteId === noteId);
    if (!item) return;
    const offer = this.parseInbox(item);
    await this.deps.shares.removeInbox(noteId);
    if (!offer) return;
    await this.deps.notes.adopt(noteId, fromBase64(offer.state), offer.color);
    await this.deps.shares.save({ noteId, signed: offer.signed, status: "active" });
    await this.sendOrQueue(item.fromId, noteId, "offer-reply", {
      t: "offer-reply",
      noteId,
      accept: true,
    });
    // sync right away with connected members (including edits the owner made after the offer)
    for (const peer of this.connectedMembers(offer.signed.membership)) {
      await this.sendStep1(peer, noteId);
    }
    this.deps.onChange();
  }

  async declineOffer(noteId: string) {
    const item = (await this.deps.shares.inbox()).find((i) => i.noteId === noteId);
    if (!item) return;
    await this.deps.shares.removeInbox(noteId);
    await this.sendOrQueue(item.fromId, noteId, "offer-reply", {
      t: "offer-reply",
      noteId,
      accept: false,
    });
    this.deps.onChange();
  }

  /** Leaves a share (member). Tells the owner and turns the note into a personal note here */
  async leave(noteId: string) {
    const record = await this.requireShare(noteId);
    const m = record.signed.membership;
    if (m.owner === this.deps.myId) throw new Error("소유자는 나갈 수 없습니다. 공유를 종료하세요");
    await this.deps.shares.save({ ...record, status: "left" });
    await this.deps.notes.setSpace(noteId, null);
    await this.sendOrQueue(m.owner, noteId, "leave", { t: "leave", noteId });
    this.deps.onChange();
  }

  /** Cleans up an ended or removed share (deletes the record, keeps the note as personal) */
  async forget(noteId: string) {
    await this.deps.shares.remove(noteId);
    await this.deps.notes.setSpace(noteId, null);
    this.deps.onChange();
  }

  // ───────────────────────────── Network ─────────────────────────────

  /** On connecting to a friend device: deliver queued messages + hello */
  async onConnected(peer: string) {
    for (const item of await this.deps.shares.outboxFor(peer)) {
      const message = decodeMessage(new TextEncoder().encode(item.payload));
      if (message && message.t !== "pair-request") {
        await this.deps.send(peer, message as SyncMessage);
        await this.deps.shares.dequeue(item.id);
      }
    }
    const shares = (await this.deps.shares.list())
      .filter((r) => r.status !== "left" && roleOf(r.signed.membership, peer))
      .map((r) => ({ noteId: r.noteId, version: r.signed.membership.version }));
    await this.deps.send(peer, { t: "hello", shares });
  }

  /** Edits from my windows → connected members */
  async onLocalUpdate(noteId: string, update: Uint8Array) {
    const record = await this.deps.shares.get(noteId);
    if (!record || record.status !== "active") return;
    const m = record.signed.membership;
    if (!canEdit(m, this.deps.myId)) return;
    const payload = toBase64(update);
    for (const peer of this.connectedMembers(m)) {
      await this.deps.send(peer, { t: "update", noteId, update: payload });
    }
  }

  async handle(from: string, message: SyncMessage) {
    switch (message.t) {
      case "hello":
        return this.onHello(from, message.shares);
      case "membership":
        return this.onMembership(from, message.signed);
      case "offer":
        return this.onOffer(from, message);
      case "offer-reply":
        return this.onOfferReply(from, message.noteId, message.accept);
      case "sync-step1":
        return this.onStep1(from, message.noteId, message.sv);
      case "sync-step2":
      case "update":
        return this.onDocData(from, message.noteId, message.update);
      case "leave":
        return this.onLeave(from, message.noteId);
      case "awareness":
        return; // cursors are handled by PresenceHub
    }
  }

  private async onHello(from: string, theirs: { noteId: string; version: number }[]) {
    for (const { noteId, version } of theirs) {
      const record = await this.deps.shares.get(noteId);
      if (!record || record.status === "left") continue;
      const m = record.signed.membership;
      if (!roleOf(m, from)) continue;
      if (m.version > version)
        await this.deps.send(from, { t: "membership", signed: record.signed });
      if (record.status === "active" && m.status === "active" && roleOf(m, this.deps.myId)) {
        await this.sendStep1(from, noteId);
      }
    }
  }

  private async onMembership(from: string, signed: SignedMembership) {
    const record = await this.deps.shares.get(signed.membership.noteId);
    if (!record) return; // ignore member lists that arrive without a share offer
    const accepted = await this.acceptNewer(record, signed);
    if (!accepted) return;
    const m = signed.membership;
    const stillMember = !!roleOf(m, this.deps.myId);
    const status = m.status === "ended" ? "ended" : stillMember ? "active" : "left";
    if (record.status !== "left") {
      await this.deps.shares.save({ noteId: m.noteId, signed, status });
      if (status !== "active") await this.deps.notes.setSpace(m.noteId, null);
    } else {
      await this.deps.shares.save({ ...record, signed });
    }
    // pass it on to other members (only newer versions are accepted, so it doesn't loop)
    await this.broadcastMembership(
      signed,
      m.members.map((x) => x.id).filter((id) => id !== from),
    );
    if (status === "active") await this.sendStep1(from, m.noteId);
    this.deps.onChange();
  }

  private async onOffer(from: string, offer: Extract<SyncMessage, { t: "offer" }>) {
    const m = offer.signed.membership;
    if (m.owner !== from || m.status !== "active" || !roleOf(m, this.deps.myId)) return;
    if (!(await this.verifySigned(offer.signed))) return;
    const existing = await this.deps.shares.get(m.noteId);
    if (existing && existing.status === "active") {
      // if already shared, treat it as a member-list update only
      await this.onMembership(from, offer.signed);
      return;
    }
    // keep one friend from flooding the inbox with offers (a new offer for the same note overwrites)
    const inbox = (await this.deps.shares.inbox()).filter((i) => i.noteId !== m.noteId);
    if (
      inbox.length >= MAX_INBOX ||
      inbox.filter((i) => i.fromId === from).length >= MAX_INBOX_PER_PEER
    ) {
      return;
    }
    await this.deps.shares.putInbox({
      noteId: m.noteId,
      fromId: from,
      payload: new TextDecoder().decode(encodeMessage(offer)),
      receivedAt: this.now(),
    });
    this.deps.onChange();
  }

  private async onOfferReply(from: string, noteId: string, accept: boolean) {
    if (accept) return;
    const record = await this.deps.shares.get(noteId);
    if (!record || record.signed.membership.owner !== this.deps.myId) return;
    const m = record.signed.membership;
    if (!roleOf(m, from) || from === m.owner) return;
    await this.updateMembers(
      noteId,
      m.members.filter((x) => x.id !== from),
    );
  }

  private async onLeave(from: string, noteId: string) {
    await this.onOfferReply(from, noteId, false);
  }

  private async onStep1(from: string, noteId: string, sv: string) {
    const record = await this.deps.shares.get(noteId);
    if (!record || record.status !== "active") return;
    const m = record.signed.membership;
    if (!roleOf(m, from) || !canEdit(m, this.deps.myId)) return;
    const diff = await this.deps.notes.diffSince(noteId, fromBase64(sv));
    if (diff.length <= EMPTY_UPDATE_BYTES) return;
    await this.deps.send(from, { t: "sync-step2", noteId, update: toBase64(diff) });
  }

  private async onDocData(from: string, noteId: string, update: string) {
    const record = await this.deps.shares.get(noteId);
    if (!record || record.status !== "active") return;
    const m = record.signed.membership;
    // drop data from view-only or non-member devices
    if (!canEdit(m, from) || !roleOf(m, this.deps.myId)) return;
    const changed = await this.deps.notes.applyRemote(noteId, fromBase64(update));
    // relay only edits that were new to me → the same edit doesn't circulate forever
    if (!changed || !canEdit(m, this.deps.myId)) return;
    for (const peer of this.connectedMembers(m)) {
      if (peer !== from) await this.deps.send(peer, { t: "update", noteId, update });
    }
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private connectedMembers(m: Membership) {
    const members = new Set(m.members.map((x) => x.id));
    return this.deps.connectedPeers().filter((p) => p !== this.deps.myId && members.has(p));
  }

  private async sendStep1(peer: string, noteId: string) {
    const sv = await this.deps.notes.stateVector(noteId);
    await this.deps.send(peer, { t: "sync-step1", noteId, sv: toBase64(sv) });
  }

  private async sendOffer(peer: string, signed: SignedMembership) {
    const noteId = signed.membership.noteId;
    const info = await this.deps.notes.info(noteId);
    const state = await this.deps.notes.docState(noteId);
    await this.sendOrQueue(peer, noteId, "offer", {
      t: "offer",
      signed,
      title: info?.title ?? "",
      color: info?.color ?? "yellow",
      state: toBase64(state),
    });
  }

  private async sendOrQueue(
    peer: string,
    noteId: string,
    kind: "offer" | "leave" | "offer-reply",
    message: SyncMessage,
  ) {
    if (this.deps.connectedPeers().includes(peer)) {
      try {
        await this.deps.send(peer, message);
        return;
      } catch {
        // queue it if the connection drops while sending
      }
    }
    await this.deps.shares.enqueue({
      deviceId: peer,
      noteId,
      kind,
      payload: new TextDecoder().decode(encodeMessage(message)),
    });
  }

  private async broadcastMembership(signed: SignedMembership, ids: string[]) {
    const targets = new Set(ids);
    for (const peer of this.deps.connectedPeers()) {
      if (peer !== this.deps.myId && targets.has(peer)) {
        await this.deps.send(peer, { t: "membership", signed });
      }
    }
  }

  /** true if the signature is the owner's, the owner is the same and the version is higher */
  private async acceptNewer(record: ShareRecord, signed: SignedMembership) {
    const cur = record.signed.membership;
    const next = signed.membership;
    if (next.noteId !== cur.noteId || next.owner !== cur.owner || next.version <= cur.version) {
      return false;
    }
    return this.verifySigned(signed);
  }

  private verifySigned(signed: SignedMembership) {
    return this.deps.verify(
      signed.membership.owner,
      membershipBytes(signed.membership),
      signed.signature,
    );
  }

  private async signMembership(membership: Membership): Promise<SignedMembership> {
    return { membership, signature: await this.deps.sign(membershipBytes(membership)) };
  }

  private parseInbox(item: InboxItem) {
    const message = decodeMessage(new TextEncoder().encode(item.payload));
    return message?.t === "offer" ? message : null;
  }

  private async requireShare(noteId: string) {
    const record = await this.deps.shares.get(noteId);
    if (!record) throw new Error("공유 중인 메모가 아닙니다");
    return record;
  }

  private assertOwner(m: Membership) {
    if (m.owner !== this.deps.myId) throw new Error("소유자만 멤버를 바꿀 수 있습니다");
  }
}
