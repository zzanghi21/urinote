/**
 * 친구 공유 P2P 메시지 (DESIGN.md 4.9.3, 4.9.5). Rust 계층은 바이트만 나르고 해석은 여기서 한다.
 * 상대가 보낸 데이터는 믿지 않는다: 형식이 맞지 않으면 버린다.
 */

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

export type ShareMessage = PairMessage;

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
    default:
      return null;
  }
}
