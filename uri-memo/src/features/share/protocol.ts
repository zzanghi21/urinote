/**
 * P2P messages for friend sharing (DESIGN.md 4.9.3, 4.9.5). The Rust layer only carries bytes; they
 * are interpreted here. Data from the other side is never trusted: malformed messages are dropped.
 */

import { NOTE_COLORS, type NoteColor } from "../../domain/note";
import { parseMembership, type SignedMembership } from "./membership";

export const PROTOCOL_VERSION = 1;
const MAX_NAME = 64;
const MAX_TOKEN = 128;

export type PairMessage =
  /** Friend request (requester → receiver). commit = base64(SHA-256(random value)) */
  | { t: "pair-request"; name: string; commit: string }
  /** Accepting the request (receiver → requester) */
  | { t: "pair-accept"; name: string; commit: string }
  /** Random value reveal, sent only after receiving the other side's commit */
  | { t: "pair-reveal"; nonce: string }
  /** The user confirmed both screens show the same code */
  | { t: "pair-confirm" }
  | { t: "pair-cancel"; reason: string };

/** Sharing/sync messages (DESIGN.md 4.9.5). base64 fields hold Yjs data */
export type SyncMessage =
  /** Right after connecting: my shared notes involving the peer and their member-list versions */
  | { t: "hello"; shares: { noteId: string; version: number }[] }
  /** Signed member list (when newer than the peer's) */
  | { t: "membership"; signed: SignedMembership }
  /** Share offer (owner → new member): member list + title + full document state */
  | { t: "offer"; signed: SignedMembership; title: string; color: NoteColor; state: string }
  | { t: "offer-reply"; noteId: string; accept: boolean }
  /** My state vector → the peer replies with the diff I lack via sync-step2 */
  | { t: "sync-step1"; noteId: string; sv: string }
  | { t: "sync-step2"; noteId: string; update: string }
  /** Live edit */
  | { t: "update"; noteId: string; update: string }
  /** Leaving the share (member → owner) */
  | { t: "leave"; noteId: string }
  /** Cursor and selection (y-protocols awareness update). Never stored or relayed to other members */
  | { t: "awareness"; noteId: string; update: string };

export type ShareMessage = PairMessage | SyncMessage;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeMessage(message: ShareMessage): Uint8Array {
  return encoder.encode(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export function decodeMessage(data: Uint8Array): ShareMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(data));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== PROTOCOL_VERSION) return null;

  switch (m.t) {
    case "pair-request":
    case "pair-accept":
      return isText(m.name, MAX_NAME) && isText(m.commit, MAX_TOKEN)
        ? { t: m.t, name: m.name, commit: m.commit }
        : null;
    case "pair-reveal":
      return isText(m.nonce, MAX_TOKEN) ? { t: m.t, nonce: m.nonce } : null;
    case "pair-confirm":
      return { t: m.t };
    case "pair-cancel":
      return { t: m.t, reason: typeof m.reason === "string" ? m.reason.slice(0, 200) : "" };
    case "hello": {
      if (!Array.isArray(m.shares) || m.shares.length > MAX_HELLO_SHARES) return null;
      const shares: { noteId: string; version: number }[] = [];
      for (const s of m.shares as unknown[]) {
        const { noteId, version } = (s ?? {}) as Record<string, unknown>;
        if (!isText(noteId, MAX_TOKEN) || !Number.isSafeInteger(version)) return null;
        shares.push({ noteId, version: version as number });
      }
      return { t: m.t, shares };
    }
    case "membership": {
      const signed = parseSigned(m.signed);
      return signed ? { t: m.t, signed } : null;
    }
    case "offer": {
      const signed = parseSigned(m.signed);
      if (!signed || typeof m.title !== "string" || !isColor(m.color) || !isData(m.state)) {
        return null;
      }
      return { t: m.t, signed, title: m.title.slice(0, 200), color: m.color, state: m.state };
    }
    case "offer-reply":
      return isText(m.noteId, MAX_TOKEN) && typeof m.accept === "boolean"
        ? { t: m.t, noteId: m.noteId, accept: m.accept }
        : null;
    case "sync-step1":
      return isText(m.noteId, MAX_TOKEN) && isData(m.sv)
        ? { t: m.t, noteId: m.noteId, sv: m.sv }
        : null;
    case "sync-step2":
    case "update":
      return isText(m.noteId, MAX_TOKEN) && isData(m.update)
        ? { t: m.t, noteId: m.noteId, update: m.update }
        : null;
    case "leave":
      return isText(m.noteId, MAX_TOKEN) ? { t: m.t, noteId: m.noteId } : null;
    case "awareness":
      return isText(m.noteId, MAX_TOKEN) && isData(m.update, MAX_AWARENESS)
        ? { t: m.t, noteId: m.noteId, update: m.update }
        : null;
    default:
      return null;
  }
}

const MAX_HELLO_SHARES = 500;
/** Below the Rust layer's frame limit (4 MB) */
const MAX_DATA = 4 * 1024 * 1024;
/** Cursor state is small. Limited separately so large data can't keep the windows busy */
const MAX_AWARENESS = 16 * 1024;

const isData = (value: unknown, max = MAX_DATA): value is string =>
  typeof value === "string" && value.length <= max && /^[A-Za-z0-9+/]*={0,2}$/.test(value);

const isColor = (value: unknown): value is NoteColor =>
  (NOTE_COLORS as readonly unknown[]).includes(value);

function parseSigned(raw: unknown): SignedMembership | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { membership, signature } = raw as Record<string, unknown>;
  const parsed = parseMembership(membership);
  return parsed && isText(signature, MAX_TOKEN) ? { membership: parsed, signature } : null;
}
