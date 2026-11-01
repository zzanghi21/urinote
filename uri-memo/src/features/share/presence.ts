import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { Awareness, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import type { SharesRepository } from "../../data/local/sharesRepo";
import { t } from "../../i18n";
import { roleOf } from "./membership";
import type { SyncMessage } from "./protocol";

/**
 * 함께 편집 중인 친구의 커서·이름 표시 (DESIGN.md 4.9.8, S4).
 *
 * 각 창은 메모마다 Awareness 를 두고 내 커서를 `awareness:update` 창 이벤트로 낸다.
 * Hub 의 PresenceHub 가 그것을 연결된 멤버에게 보내고, 받은 친구 커서는 검사한 뒤 창들에 전한다.
 * 커서는 저장하지 않고 바로 연결된 기기끼리만 주고받는다 (다른 멤버를 거쳐 전하지 않음).
 */

export interface PresenceUser {
  name: string;
  color: string;
}

/** 기기 ID 로 정하는 커서 색. 모든 기기에서 같은 친구는 같은 색으로 보인다 */
const PALETTE = [
  "#e5484d",
  "#f76b15",
  "#ad7f00",
  "#30a46c",
  "#0d9488",
  "#0090ff",
  "#6e56cf",
  "#d6409f",
];

export function presenceColor(deviceId: string) {
  let hash = 0;
  for (const ch of deviceId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** 메시지 1개에 담을 수 있는 커서 수와, 친구 기기 1대가 메모마다 가질 수 있는 커서 수(창 수) */
const MAX_ENTRIES = 8;
const MAX_CLIENTS_PER_PEER = 8;
const MAX_STATE_JSON = 4096;

export interface AwarenessEntry {
  clientID: number;
  clock: number;
  state: AwarenessState | null;
}

export interface AwarenessState {
  user: PresenceUser;
  cursor: { anchor: RelPos; head: RelPos } | null;
}

interface Id {
  client: number;
  clock: number;
}

interface RelPos {
  type: Id | null;
  tname: string | null;
  item: Id | null;
  assoc: number;
}

/**
 * y-protocols 의 awareness 업데이트를 읽는다. 형식이 틀리면 null.
 * 상대가 보낸 상태에서 커서 위치만 골라 내고 나머지(이름·색 포함)는 버린다.
 */
export function parseAwarenessUpdate(bytes: Uint8Array): AwarenessEntry[] | null {
  try {
    const d = decoding.createDecoder(bytes);
    const count = decoding.readVarUint(d);
    if (count > MAX_ENTRIES) return null;
    const entries: AwarenessEntry[] = [];
    for (let i = 0; i < count; i++) {
      const clientID = decoding.readVarUint(d);
      const clock = decoding.readVarUint(d);
      const json = decoding.readVarString(d);
      if (json.length > MAX_STATE_JSON) return null;
      const raw: unknown = JSON.parse(json);
      entries.push({ clientID, clock, state: raw === null ? null : parseState(raw) });
    }
    return decoding.hasContent(d) ? null : entries;
  } catch {
    return null;
  }
}

export function encodeAwarenessEntries(entries: AwarenessEntry[]): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(e, entry.clientID);
    encoding.writeVarUint(e, entry.clock);
    encoding.writeVarString(e, JSON.stringify(entry.state));
  }
  return encoding.toUint8Array(e);
}

/** 이름·색은 받는 쪽이 붙이므로 여기서는 빈 값으로 둔다 */
function parseState(raw: unknown): AwarenessState {
  const cursor = (raw as { cursor?: unknown } | null)?.cursor;
  const anchor = parseRelPos((cursor as { anchor?: unknown } | null)?.anchor);
  const head = parseRelPos((cursor as { head?: unknown } | null)?.head);
  return { user: { name: "", color: "" }, cursor: anchor && head ? { anchor, head } : null };
}

function parseRelPos(raw: unknown): RelPos | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = parseId(r.type);
  const item = parseId(r.item);
  if (type === undefined || item === undefined) return null;
  const tname = r.tname == null ? null : r.tname;
  if (tname !== null && (typeof tname !== "string" || tname.length > 64)) return null;
  const assoc = r.assoc == null ? 0 : r.assoc;
  if (!Number.isSafeInteger(assoc)) return null;
  return { type, tname, item, assoc: assoc as number };
}

/** 없으면 null, 형식이 틀리면 undefined */
function parseId(raw: unknown): Id | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "object") return undefined;
  const { client, clock } = raw as Record<string, unknown>;
  return Number.isSafeInteger(client) && Number.isSafeInteger(clock)
    ? { client: client as number, clock: clock as number }
    : undefined;
}

// ───────────────────────────── Hub ─────────────────────────────

export interface PresenceDeps {
  myId: string;
  shares: SharesRepository;
  connectedPeers(): string[];
  send(peer: string, message: SyncMessage): Promise<void>;
  /** 친구 커서 상태를 내 창들에 전한다 (base64 awareness 업데이트) */
  toWindows(noteId: string, update: string): void;
  /** 화면에 보일 친구 이름 (내 친구 목록의 이름) */
  nameOf(deviceId: string): string | undefined;
}

interface Mirror {
  awareness: Awareness;
  /** 커서(clientID) → 그 커서를 보낸 친구 기기. 다른 기기의 커서를 지우거나 바꾸지 못하게 한다 */
  owners: Map<number, string>;
}

/** Hub 창 전용: 내 창들의 커서 ↔ 연결된 멤버 */
export class PresenceHub {
  private mirrors = new Map<string, Mirror>();

  constructor(private readonly deps: PresenceDeps) {}

  /** 내 창들의 커서 ID. 친구가 이 ID 로 상태를 보내 내 커서를 덮어쓰지 못하게 한다 */
  private localClients = new Set<number>();

  /** 내 창에서 커서가 바뀌었다 → 이 메모를 함께 보는 연결된 멤버에게 */
  async onLocal(noteId: string, update: string) {
    for (const entry of parseAwarenessUpdate(fromBase64(update)) ?? []) {
      this.localClients.add(entry.clientID);
    }
    const members = await this.members(noteId);
    if (!members) return;
    for (const peer of this.deps.connectedPeers()) {
      if (peer !== this.deps.myId && members.has(peer)) {
        await this.deps.send(peer, { t: "awareness", noteId, update });
      }
    }
  }

  async onRemote(from: string, noteId: string, update: string) {
    const members = await this.members(noteId);
    if (!members?.has(from)) return;
    const entries = parseAwarenessUpdate(fromBase64(update));
    if (!entries) return;

    const mirror = this.mirror(noteId);
    const user: PresenceUser = {
      name: this.deps.nameOf(from) ?? members.get(from) ?? t("친구"),
      color: presenceColor(from),
    };
    let owned = [...mirror.owners.values()].filter((p) => p === from).length;
    const accepted = entries.filter((entry) => {
      if (this.localClients.has(entry.clientID)) return false;
      const owner = mirror.owners.get(entry.clientID);
      if (owner !== undefined) return owner === from;
      if (owned >= MAX_CLIENTS_PER_PEER) return false;
      owned++;
      return true;
    });
    if (accepted.length === 0) return;
    for (const entry of accepted) {
      mirror.owners.set(entry.clientID, from);
      if (entry.state) entry.state.user = user;
    }
    const clean = encodeAwarenessEntries(accepted);
    applyAwarenessUpdate(mirror.awareness, clean, from);
    this.deps.toWindows(noteId, toBase64(clean));
  }

  /** 친구 기기와 연결이 끊기면 그 친구의 커서를 바로 지운다 (기다리면 30초 뒤 사라짐) */
  onDisconnected(peer: string) {
    for (const [noteId, mirror] of this.mirrors) {
      const clients = [...mirror.owners].filter(([, p]) => p === peer).map(([id]) => id);
      if (clients.length === 0) continue;
      removeAwarenessStates(mirror.awareness, clients, "disconnect");
      this.deps.toWindows(noteId, toBase64(encodeOf(mirror.awareness, clients)));
      for (const id of clients) mirror.owners.delete(id);
    }
  }

  /** 막 열린 창이 지금 보이는 친구 커서를 요청했다 */
  query(noteId: string) {
    const mirror = this.mirrors.get(noteId);
    if (!mirror) return;
    const clients = [...mirror.awareness.getStates().keys()];
    if (clients.length > 0) {
      this.deps.toWindows(noteId, toBase64(encodeOf(mirror.awareness, clients)));
    }
  }

  destroy() {
    for (const mirror of this.mirrors.values()) mirror.awareness.destroy();
    this.mirrors.clear();
  }

  /** 공유 중이고 나도 멤버이면 멤버 ID → 이름, 아니면 null */
  private async members(noteId: string) {
    const record = await this.deps.shares.get(noteId);
    if (!record || record.status !== "active") return null;
    const m = record.signed.membership;
    if (m.status !== "active" || !roleOf(m, this.deps.myId)) return null;
    return new Map(m.members.map((x) => [x.id, x.name]));
  }

  private mirror(noteId: string): Mirror {
    let mirror = this.mirrors.get(noteId);
    if (!mirror) {
      const awareness = new Awareness(new Y.Doc());
      awareness.setLocalState(null); // Hub 자신의 커서는 창들이 따로 낸다
      mirror = { awareness, owners: new Map() };
      this.mirrors.set(noteId, mirror);
    }
    return mirror;
  }
}

const encodeOf = (awareness: Awareness, clients: number[]) => {
  const states = awareness.getStates();
  return encodeAwarenessEntries(
    clients.map((clientID) => ({
      clientID,
      clock: awareness.meta.get(clientID)?.clock ?? 0,
      state: (states.get(clientID) as AwarenessState | undefined) ?? null,
    })),
  );
};
