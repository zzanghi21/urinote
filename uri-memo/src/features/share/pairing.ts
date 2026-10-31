import { fromBase64, toBase64 } from "../../domain/noteDoc";
import type { PairMessage } from "./protocol";

/**
 * 친구 등록 (DESIGN.md 4.9.3) — 블루투스 "숫자 비교" 방식의 커밋-공개.
 *
 * 1. 요청한 쪽 A: 임의값 nA 를 만들고 H(nA) 를 담아 pair-request
 * 2. 받는 쪽 B: 사용자가 수락하면 H(nB) 를 담아 pair-accept, 이어서 nB 공개
 * 3. A: B 의 커밋을 받았으므로 nA 공개
 * 4. 양쪽: 상대 공개값이 커밋과 맞는지 확인 → 코드 = H(작은ID, 큰ID, n작은ID, n큰ID) 의 6자리
 * 5. 두 사람이 화면의 코드가 같은지 확인하고 [예] → 양쪽 모두 예면 친구로 저장
 *
 * 각자 상대의 커밋을 받은 뒤에만 자기 임의값을 공개하므로, 중간자가 임의값을 골라
 * 양쪽 코드를 같게 만들 수 없다 (성공 확률 100만 분의 1).
 * 상대 기기 ID 는 P2P 계층이 TLS 로 확인한 값이다.
 */

export type PairingPhase =
  | "requesting" // 요청을 보내고 상대의 수락을 기다림
  | "incoming" // 요청을 받음, 내 수락을 기다림
  | "exchanging" // 임의값 교환 중
  | "confirm" // 코드 표시, 내 확인을 기다림
  | "waiting-peer" // 나는 확인함, 상대 확인을 기다림
  | "done"
  | "failed";

export interface PairingView {
  peerId: string;
  peerName: string;
  role: "initiator" | "responder";
  phase: PairingPhase;
  /** "482 913" */
  code?: string;
  error?: string;
}

export interface PairingDeps {
  myId: string;
  myName: string;
  send(peerId: string, message: PairMessage): Promise<void>;
  onChange(view: PairingView): void;
  onPaired(peerId: string, peerName: string): void;
  random?: (length: number) => Uint8Array;
}

export const PAIRING_TIMEOUT_MS = 2 * 60 * 1000;
const NONCE_BYTES = 32;

const defaultRandom = (length: number) => crypto.getRandomValues(new Uint8Array(length));

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** 두 기기가 같은 순서로 계산하도록 기기 ID 로 정렬한다 */
export async function pairingCode(
  idA: string,
  nonceA: Uint8Array,
  idB: string,
  nonceB: Uint8Array,
): Promise<string> {
  const [first, second] =
    idA < idB
      ? [
          [idA, nonceA],
          [idB, nonceB],
        ]
      : [
          [idB, nonceB],
          [idA, nonceA],
        ];
  const utf8 = new TextEncoder();
  const hash = await sha256(
    utf8.encode(`urinote-pair-v1|${first[0]}|${second[0]}|`),
    first[1] as Uint8Array,
    second[1] as Uint8Array,
  );
  const value = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
  const digits = String(value % 1_000_000).padStart(6, "0");
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export class PairingSession {
  private phase: PairingPhase;
  private ownNonce: Uint8Array | null = null;
  private peerCommit: Uint8Array | null = null;
  private peerNonce: Uint8Array | null = null;
  private code: string | undefined;
  private error: string | undefined;
  private localConfirmed = false;
  private remoteConfirmed = false;
  private timer: ReturnType<typeof setTimeout>;

  private constructor(
    private readonly deps: PairingDeps,
    readonly peerId: string,
    private peerName: string,
    readonly role: "initiator" | "responder",
  ) {
    this.phase = role === "initiator" ? "requesting" : "incoming";
    this.timer = setTimeout(() => void this.cancel("시간이 초과되었습니다"), PAIRING_TIMEOUT_MS);
  }

  /**
   * 내가 보낼 친구 요청. 상대 응답을 놓치지 않도록 세션을 먼저 등록한 뒤 `begin()` 으로 보낸다.
   */
  static outgoing(deps: PairingDeps, peerId: string, peerName: string) {
    return new PairingSession(deps, peerId, peerName, "initiator");
  }

  async begin() {
    if (this.role !== "initiator" || this.ownNonce) return;
    const commit = await this.makeCommit();
    this.notify();
    await this.sendOrFail({ t: "pair-request", name: this.deps.myName, commit });
  }

  /** 상대의 친구 요청을 받았다 */
  static fromRequest(
    deps: PairingDeps,
    peerId: string,
    request: Extract<PairMessage, { t: "pair-request" }>,
  ) {
    const session = new PairingSession(deps, peerId, request.name, "responder");
    session.peerCommit = fromBase64(request.commit);
    session.notify();
    return session;
  }

  get view(): PairingView {
    return {
      peerId: this.peerId,
      peerName: this.peerName,
      role: this.role,
      phase: this.phase,
      code: this.code,
      error: this.error,
    };
  }

  get finished() {
    return this.phase === "done" || this.phase === "failed";
  }

  /** 받는 쪽: 요청 수락 */
  async accept() {
    if (this.phase !== "incoming") return;
    this.phase = "exchanging";
    const commit = await this.makeCommit();
    this.notify();
    await this.sendOrFail({ t: "pair-accept", name: this.deps.myName, commit });
    // 상대의 커밋은 요청에서 이미 받았으므로 바로 공개해도 된다
    await this.sendOrFail({ t: "pair-reveal", nonce: toBase64(this.ownNonce!) });
  }

  /** 두 화면의 코드가 같은지에 대한 사용자 응답 */
  async confirm(same: boolean) {
    if (this.phase !== "confirm") return;
    if (!same) {
      await this.cancel("확인 코드가 서로 다릅니다");
      return;
    }
    this.localConfirmed = true;
    this.phase = "waiting-peer";
    this.notify();
    await this.sendOrFail({ t: "pair-confirm" });
    this.completeIfBothConfirmed();
  }

  async cancel(reason: string) {
    if (this.finished) return;
    this.fail(reason);
    await this.deps.send(this.peerId, { t: "pair-cancel", reason }).catch(() => undefined);
  }

  async handle(message: PairMessage) {
    if (this.finished) return;
    switch (message.t) {
      case "pair-accept":
        if (this.role !== "initiator" || this.phase !== "requesting") return this.protocolError();
        this.peerName = message.name;
        this.peerCommit = fromBase64(message.commit);
        this.phase = "exchanging";
        this.notify();
        await this.sendOrFail({ t: "pair-reveal", nonce: toBase64(this.ownNonce!) });
        await this.tryComputeCode();
        return;
      case "pair-reveal": {
        if (this.phase !== "exchanging" || !this.peerCommit || this.peerNonce) {
          return this.protocolError();
        }
        const nonce = fromBase64(message.nonce);
        if (!sameBytes(await sha256(nonce), this.peerCommit)) {
          await this.cancel("상대가 보낸 값이 약속과 다릅니다 (연결이 조작되었을 수 있음)");
          return;
        }
        this.peerNonce = nonce;
        await this.tryComputeCode();
        return;
      }
      case "pair-confirm":
        if (this.phase !== "confirm" && this.phase !== "waiting-peer") return this.protocolError();
        this.remoteConfirmed = true;
        this.completeIfBothConfirmed();
        return;
      case "pair-cancel":
        this.fail(message.reason || "상대가 취소했습니다");
        return;
      case "pair-request":
        return this.protocolError();
    }
  }

  private async makeCommit() {
    this.ownNonce = (this.deps.random ?? defaultRandom)(NONCE_BYTES);
    return toBase64(await sha256(this.ownNonce));
  }

  /** 내 임의값을 공개했고 상대 임의값도 확인했으면 코드를 만든다 */
  private async tryComputeCode() {
    if (this.code || !this.ownNonce || !this.peerNonce || this.phase !== "exchanging") return;
    this.code = await pairingCode(this.deps.myId, this.ownNonce, this.peerId, this.peerNonce);
    this.phase = "confirm";
    this.notify();
  }

  private completeIfBothConfirmed() {
    if (!this.localConfirmed || !this.remoteConfirmed || this.finished) return;
    clearTimeout(this.timer);
    this.phase = "done";
    this.notify();
    this.deps.onPaired(this.peerId, this.peerName);
  }

  private async sendOrFail(message: PairMessage) {
    try {
      await this.deps.send(this.peerId, message);
    } catch (e) {
      this.fail(`메시지를 보내지 못했습니다: ${String(e)}`);
    }
  }

  private async protocolError() {
    await this.cancel("예상하지 못한 메시지를 받았습니다");
  }

  private fail(reason: string) {
    clearTimeout(this.timer);
    this.phase = "failed";
    this.error = reason;
    this.notify();
  }

  private notify() {
    this.deps.onChange(this.view);
  }
}
