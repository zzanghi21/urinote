/**
 * 친구 공유 P2P 메시지 (DESIGN.md 4.9.3, 4.9.5). Rust 계층은 바이트만 나르고 해석은 여기서 한다.
 * 상대가 보낸 데이터는 믿지 않는다: 형식이 맞지 않으면 버린다.
 */

import { NOTE_COLORS, type NoteColor } from "../../domain/note";
import { parseMembership, type SignedMembership } from "./membership";

export const PROTOCOL_VERSION = 1;
const MAX_NAME = 64;
const MAX_TOKEN = 128;

export type PairMessage =
  /** 친구 요청 (요청한 쪽 → 받는 쪽). commit = base64(SHA-256(임의값)) */
  | { t: "pair-request"; name: string; commit: string }
  /** 요청 수락 (받는 쪽 → 요청한 쪽) */
  | { t: "pair-accept"; name: string; commit: string }
  /** 상대의 commit 을 받은 뒤에만 보내는 임의값 공개 */
  | { t: "pair-reveal"; nonce: string }
  /** 사용자가 두 화면의 코드가 같다고 확인 */
  | { t: "pair-confirm" }
  | { t: "pair-cancel"; reason: string };

/** 공유·동기화 메시지 (DESIGN.md 4.9.5). base64 필드는 Yjs 데이터 */
export type SyncMessage =
  /** 연결 직후: 상대와 관련된 내 공유 메모와 멤버 목록 버전 */
  | { t: "hello"; shares: { noteId: string; version: number }[] }
  /** 서명된 멤버 목록 (상대가 가진 것보다 새 버전일 때) */
  | { t: "membership"; signed: SignedMembership }
  /** 공유 제안 (소유자 → 새 멤버): 멤버 목록 + 제목 + 문서 전체 상태 */
  | { t: "offer"; signed: SignedMembership; title: string; color: NoteColor; state: string }
  | { t: "offer-reply"; noteId: string; accept: boolean }
  /** 내 상태 벡터 → 상대는 내게 없는 차분을 sync-step2 로 보낸다 */
  | { t: "sync-step1"; noteId: string; sv: string }
  | { t: "sync-step2"; noteId: string; update: string }
  /** 실시간 편집 */
  | { t: "update"; noteId: string; update: string }
  /** 공유 나가기 알림 (멤버 → 소유자) */
  | { t: "leave"; noteId: string }
  /** 커서·선택 영역 (y-protocols awareness 업데이트). 저장하지 않고 다른 멤버에게 전하지 않는다 */
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
/** Rust 계층의 프레임 상한(4MB)보다 작다 */
const MAX_DATA = 4 * 1024 * 1024;
/** 커서 상태는 작다. 큰 데이터로 창들을 바쁘게 만들지 못하게 따로 제한한다 */
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
