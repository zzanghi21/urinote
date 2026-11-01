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
 * 공유·동기화 엔진 (DESIGN.md 4.9.4 ~ 4.9.7). Hub 창에서 하나만 돈다.
 *
 * 권한 규칙 (4.9.6) — 모두 "내가 아는 최신 멤버 목록" 기준:
 * - 문서 데이터(sync-step2, update)는 owner·editor 기기에게서만 받는다
 * - 문서 데이터는 멤버에게만, 그리고 내가 owner·editor 일 때만 보낸다
 * - 멤버 목록은 소유자 서명이 맞고 버전이 더 클 때만 받는다
 * 연결 상대의 기기 ID(from)는 P2P 계층이 TLS 로 확인한 값이다.
 */

/** 노트·문서 저장소와의 연결 (앱에서는 NoteService + DocStore + 창 이벤트) */
export interface NoteBridge {
  info(noteId: string): Promise<{ title: string; color: NoteColor } | null>;
  /** 문서 전체 상태 (Yjs 업데이트) */
  docState(noteId: string): Promise<Uint8Array>;
  stateVector(noteId: string): Promise<Uint8Array>;
  /** 상태 벡터 이후의 차분 */
  diffSince(noteId: string, stateVector: Uint8Array): Promise<Uint8Array>;
  /** 받은 업데이트를 저장하고 열린 창에 반영한다. 내 문서가 실제로 바뀌었으면 true */
  applyRemote(noteId: string, update: Uint8Array): Promise<boolean>;
  /** 받은 공유 제안으로 내 기기에 메모를 만든다 */
  adopt(noteId: string, state: Uint8Array, color: NoteColor): Promise<void>;
  /** 공유 표시를 붙이거나(noteId) 떼어 개인 메모로 만든다(null) */
  setSpace(noteId: string, spaceId: string | null): Promise<void>;
}

export interface EngineDeps {
  myId: string;
  myName(): string;
  send(peerId: string, message: SyncMessage): Promise<void>;
  connectedPeers(): string[];
  /** base64 서명 */
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

/** Yjs 빈 업데이트(변경 없음)는 2바이트다 */
const EMPTY_UPDATE_BYTES = 2;

/** 아직 답하지 않은 공유 제안 상한 (전체 / 보낸 친구 1명당) */
export const MAX_INBOX = 50;
export const MAX_INBOX_PER_PEER = 10;

export class ShareEngine {
  constructor(private readonly deps: EngineDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  // ───────────────────────────── 소유자 동작 ─────────────────────────────

  /** 메모 공유 시작 또는 (이미 공유 중이면) 멤버 추가. 소유자만 가능 */
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
      // 종료했던 공유를 다시 시작해도 예전 "종료" 목록보다 새 버전이어야 한다
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

  /** 멤버 권한 변경·내보내기. 새 버전 멤버 목록에 서명해 모두에게 알린다 */
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
    // 내보낸 기기에도 알려서 그쪽 화면에 "공유에서 제외됨"을 표시하게 한다
    await this.broadcastMembership(next, [...before, ...after]);
    this.deps.onChange();
  }

  /** 소유자가 공유를 끝낸다. 기록은 남겨 두어, 나중에 만나는 멤버에게도 종료를 전한다 */
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

  // ───────────────────────────── 멤버 동작 ─────────────────────────────

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
    // 지금 연결된 멤버와 바로 동기화한다 (소유자가 제안 이후 편집한 내용 포함)
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

  /** 공유 나가기 (멤버). 소유자에게 알리고 내 기기에서는 개인 메모로 바꾼다 */
  async leave(noteId: string) {
    const record = await this.requireShare(noteId);
    const m = record.signed.membership;
    if (m.owner === this.deps.myId) throw new Error("소유자는 나갈 수 없습니다. 공유를 종료하세요");
    await this.deps.shares.save({ ...record, status: "left" });
    await this.deps.notes.setSpace(noteId, null);
    await this.sendOrQueue(m.owner, noteId, "leave", { t: "leave", noteId });
    this.deps.onChange();
  }

  /** 종료되었거나 제외된 공유를 정리한다 (기록 삭제, 메모는 개인 메모로 남김) */
  async forget(noteId: string) {
    await this.deps.shares.remove(noteId);
    await this.deps.notes.setSpace(noteId, null);
    this.deps.onChange();
  }

  // ───────────────────────────── 네트워크 ─────────────────────────────

  /** 친구 기기와 연결되었을 때: 대기 메시지 전달 + hello */
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

  /** 내 창들에서 생긴 편집 → 연결된 멤버에게 */
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
        return; // 커서는 PresenceHub 가 처리한다
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
    if (!record) return; // 공유 제안 없이 온 멤버 목록은 무시
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
    // 다른 멤버에게도 전한다 (더 새 버전만 받아들이므로 반복되지 않는다)
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
      // 이미 공유 중이면 멤버 목록 갱신으로만 처리
      await this.onMembership(from, offer.signed);
      return;
    }
    // 친구 한 명이 제안을 쏟아내 받은 목록을 채우지 못하게 한다 (같은 메모의 새 제안은 덮어쓴다)
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
    // 보기 전용 기기나 멤버가 아닌 기기가 보낸 데이터는 버린다
    if (!canEdit(m, from) || !roleOf(m, this.deps.myId)) return;
    const changed = await this.deps.notes.applyRemote(noteId, fromBase64(update));
    // 처음 받은 편집만 다른 멤버에게 전한다 → 같은 편집이 계속 돌지 않는다
    if (!changed || !canEdit(m, this.deps.myId)) return;
    for (const peer of this.connectedMembers(m)) {
      if (peer !== from) await this.deps.send(peer, { t: "update", noteId, update });
    }
  }

  // ───────────────────────────── 도우미 ─────────────────────────────

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
        // 보내는 중 끊기면 대기열로
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

  /** 서명이 소유자 것이고, 소유자가 같고, 버전이 더 크면 true */
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
