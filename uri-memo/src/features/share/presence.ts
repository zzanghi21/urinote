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
 * Cursors and names of friends editing together (DESIGN.md 4.9.8, S4).
 *
 * Each window keeps an Awareness per note and emits my cursor via the `awareness:update` window event.
 * The hub's PresenceHub sends it to connected members, and checks received friend cursors before
 * passing them to the windows. Cursors are never stored and only go between directly connected
 * devices (never relayed through other members).
 */

export interface PresenceUser {
  name: string;
  color: string;
}

/** Cursor color derived from the device ID, so a friend has the same color on every device */
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

/** Cursors per message, and cursors (windows) one friend device may have per note */
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
 * Reads a y-protocols awareness update. null if malformed.
 * Keeps only the cursor position from the received state and drops the rest (including name and color).
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

/** The receiver fills in name and color, so they are left empty here */
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

/** null if absent, undefined if malformed */
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
  /** Passes friend cursor state to my windows (base64 awareness update) */
  toWindows(noteId: string, update: string): void;
  /** Friend name to display (from my friend list) */
  nameOf(deviceId: string): string | undefined;
}

interface Mirror {
  awareness: Awareness;
  /** Cursor (clientID) → friend device that sent it. Prevents removing or changing another device's cursor */
  owners: Map<number, string>;
}

/** Hub window only: my windows' cursors ↔ connected members */
export class PresenceHub {
  private mirrors = new Map<string, Mirror>();

  constructor(private readonly deps: PresenceDeps) {}

  /** Cursor IDs of my windows, so a friend can't overwrite my cursor by sending state with them */
  private localClients = new Set<number>();

  /** My window's cursor changed → send to connected members of this note */
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

  /** Removes a friend's cursor as soon as their device disconnects (otherwise it disappears after 30 s) */
  onDisconnected(peer: string) {
    for (const [noteId, mirror] of this.mirrors) {
      const clients = [...mirror.owners].filter(([, p]) => p === peer).map(([id]) => id);
      if (clients.length === 0) continue;
      removeAwarenessStates(mirror.awareness, clients, "disconnect");
      this.deps.toWindows(noteId, toBase64(encodeOf(mirror.awareness, clients)));
      for (const id of clients) mirror.owners.delete(id);
    }
  }

  /** A newly opened window asked for the friend cursors currently known */
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

  /** Member ID → name if shared and I'm a member, otherwise null */
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
      awareness.setLocalState(null); // the hub's own cursors are emitted by the windows
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
