import { t } from "../../i18n";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import type { PairMessage } from "./protocol";

/**
 * Adding a friend (DESIGN.md 4.9.3) — commit-then-reveal, like Bluetooth "numeric comparison".
 *
 * 1. Requester A: picks a random nA and sends pair-request with H(nA)
 * 2. Receiver B: when the user accepts, sends pair-accept with H(nB), then reveals nB
 * 3. A: has B's commitment, so reveals nA
 * 4. Both: check the revealed value matches the commitment → code = 6 digits of
 *    H(smallerID, largerID, n_smallerID, n_largerID)
 * 5. Both people check the codes match and press [Yes] → saved as friends when both said yes
 *
 * Each side reveals its random value only after receiving the other's commitment, so a man in the
 * middle cannot pick values that make both codes match (1 in a million chance).
 * The peer's device ID is verified by TLS in the P2P layer.
 */

export type PairingPhase =
  | "requesting" // request sent, waiting for the other side to accept
  | "incoming" // request received, waiting for me to accept
  | "exchanging" // exchanging random values
  | "confirm" // showing the code, waiting for my confirmation
  | "waiting-peer" // I confirmed, waiting for the other side
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

/** Sorts by device ID so both devices compute in the same order */
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
   * A friend request I send. Register the session first, then send it with `begin()`, so no reply is missed.
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

  /** Received a friend request */
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

  /** Receiver: accept the request */
  async accept() {
    if (this.phase !== "incoming") return;
    this.phase = "exchanging";
    const commit = await this.makeCommit();
    this.notify();
    await this.sendOrFail({ t: "pair-accept", name: this.deps.myName, commit });
    // the other side's commitment came with the request, so revealing right away is safe
    await this.sendOrFail({ t: "pair-reveal", nonce: toBase64(this.ownNonce!) });
  }

  /** The user's answer to whether both screens show the same code */
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

  /** Computes the code once my value is revealed and the other side's value is verified */
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
      this.fail(t("메시지를 보내지 못했습니다: {error}", { error: String(e) }));
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
