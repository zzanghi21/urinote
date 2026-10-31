import { afterEach, describe, expect, it, vi } from "vitest";
import { pairingCode, PairingSession, type PairingDeps, type PairingView } from "./pairing";
import { decodeMessage, encodeMessage, type PairMessage } from "./protocol";

interface Side {
  id: string;
  name: string;
  views: PairingView[];
  paired: { peerId: string; peerName: string }[];
  session: PairingSession | null;
}

/**
 * 두 기기를 메모리 안에서 잇는다. 메시지는 실제처럼 인코딩·디코딩하고 순서대로 비동기 전달한다.
 * `tamper` 로 전송 중 메시지를 바꿔 중간자를 흉내 낼 수 있다.
 */
function wire(tamper?: (from: string, m: PairMessage) => PairMessage) {
  const a: Side = { id: "aaaa", name: "민지 PC", views: [], paired: [], session: null };
  const b: Side = { id: "bbbb", name: "준호 노트북", views: [], paired: [], session: null };
  let chain = Promise.resolve();

  const deps = (me: Side, other: Side): PairingDeps => ({
    myId: me.id,
    myName: me.name,
    onChange: (view) => me.views.push(view),
    onPaired: (peerId, peerName) => me.paired.push({ peerId, peerName }),
    send: async (peerId, message) => {
      expect(peerId).toBe(other.id);
      const sent = tamper ? tamper(me.id, message) : message;
      const decoded = decodeMessage(encodeMessage(sent))! as PairMessage;
      chain = chain.then(async () => {
        if (decoded.t === "pair-request") {
          other.session = PairingSession.fromRequest(deps(other, me), me.id, decoded);
        } else {
          await other.session?.handle(decoded);
        }
      });
    },
  });

  const settle = async () => {
    for (let i = 0; i < 20; i++) await chain;
  };
  return { a, b, deps, settle };
}

const last = (side: Side) => side.views[side.views.length - 1];

afterEach(() => vi.useRealTimers());

describe("pairing", () => {
  it("shows the same code on both devices and saves the friend when both confirm", async () => {
    const { a, b, deps, settle } = wire();
    a.session = PairingSession.outgoing(deps(a, b), b.id, "준호 노트북");
    await a.session.begin();
    await settle();
    expect(last(b).phase).toBe("incoming");
    expect(last(b).peerName).toBe("민지 PC");

    await b.session!.accept();
    await settle();
    expect(last(a).phase).toBe("confirm");
    expect(last(b).phase).toBe("confirm");
    expect(last(a).code).toMatch(/^\d{3} \d{3}$/);
    expect(last(a).code).toBe(last(b).code);

    await a.session.confirm(true);
    await settle();
    expect(a.paired).toEqual([]); // 상대 확인 전에는 저장하지 않는다
    await b.session!.confirm(true);
    await settle();

    expect(a.paired).toEqual([{ peerId: b.id, peerName: "준호 노트북" }]);
    expect(b.paired).toEqual([{ peerId: a.id, peerName: "민지 PC" }]);
    expect(last(a).phase).toBe("done");
  });

  it("aborts both sides when one user says the codes differ", async () => {
    const { a, b, deps, settle } = wire();
    a.session = PairingSession.outgoing(deps(a, b), b.id, "B");
    await a.session.begin();
    await settle();
    await b.session!.accept();
    await settle();

    await a.session.confirm(true);
    await b.session!.confirm(false);
    await settle();

    expect(last(a).phase).toBe("failed");
    expect(last(b).phase).toBe("failed");
    expect(a.paired).toEqual([]);
    expect(b.paired).toEqual([]);
  });

  it("detects a revealed value that does not match the commitment", async () => {
    const { a, b, deps, settle } = wire((from, m) =>
      from === "bbbb" && m.t === "pair-reveal" ? { ...m, nonce: btoa("x".repeat(32)) } : m,
    );
    a.session = PairingSession.outgoing(deps(a, b), b.id, "B");
    await a.session.begin();
    await settle();
    await b.session!.accept();
    await settle();

    expect(last(a).phase).toBe("failed");
    expect(last(a).error).toContain("약속과 다릅니다");
    expect(last(b).phase).toBe("failed");
  });

  it("produces different codes when a man-in-the-middle swaps device ids", async () => {
    const nonceA = crypto.getRandomValues(new Uint8Array(32));
    const nonceB = crypto.getRandomValues(new Uint8Array(32));
    const direct = await pairingCode("aaaa", nonceA, "bbbb", nonceB);
    expect(await pairingCode("bbbb", nonceB, "aaaa", nonceA)).toBe(direct); // 순서 무관
    // 중간자 M 이 A 에게는 M 으로, B 에게는 M' 으로 보이면 기기 ID 가 달라 코드가 달라진다
    expect(await pairingCode("aaaa", nonceA, "mmmm", nonceB)).not.toBe(direct);
  });

  it("rejects messages that arrive in the wrong order", async () => {
    const { a, b, deps } = wire();
    a.session = PairingSession.outgoing(deps(a, b), b.id, "B");
    await a.session.begin();
    await a.session.handle({ t: "pair-confirm" }); // 코드를 보기도 전에 확인
    expect(last(a).phase).toBe("failed");
  });

  it("times out an unanswered request", async () => {
    vi.useFakeTimers();
    const { a, b, deps } = wire();
    a.session = PairingSession.outgoing(deps(a, b), b.id, "B");
    await a.session.begin();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1);
    expect(last(a).phase).toBe("failed");
    expect(last(a).error).toContain("시간이 초과");
  });
});

describe("protocol", () => {
  it("round-trips messages and rejects malformed input", () => {
    const m: PairMessage = { t: "pair-request", name: "민지 PC", commit: "abc=" };
    expect(decodeMessage(encodeMessage(m))).toEqual(m);
    expect(decodeMessage(new TextEncoder().encode("not json"))).toBeNull();
    expect(decodeMessage(new TextEncoder().encode('{"v":99,"t":"pair-confirm"}'))).toBeNull();
    expect(
      decodeMessage(
        new TextEncoder().encode(
          `{"v":1,"t":"pair-request","name":"${"x".repeat(65)}","commit":"a"}`,
        ),
      ),
    ).toBeNull();
    expect(decodeMessage(new Uint8Array([0xff, 0xfe]))).toBeNull();
  });
});
