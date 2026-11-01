import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MemorySharesRepository } from "../../data/local/sharesRepo";
import { DOC_FIELD } from "../../domain/editorSchema";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import { membershipBytes, type SignedMembership } from "./membership";
import { decodeMessage, encodeMessage, type SyncMessage } from "./protocol";
import { MAX_INBOX_PER_PEER, ShareEngine, type NoteBridge } from "./shareEngine";

/** 테스트용 서명: 기기마다 비밀값을 두고 HMAC 처럼 동작한다 (위조 불가) */
const secrets = new Map<string, string>();
async function hmac(signer: string, data: Uint8Array) {
  const key = new TextEncoder().encode(secrets.get(signer) ?? "");
  const joined = new Uint8Array(key.length + data.length);
  joined.set(key);
  joined.set(data, key.length);
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", joined)));
}

class Device {
  docs = new Map<string, Y.Doc>();
  colors = new Map<string, string>();
  spaces = new Map<string, string | null>();
  shares = new MemorySharesRepository();
  engine: ShareEngine;

  constructor(
    readonly id: string,
    readonly name: string,
    net: Network,
  ) {
    secrets.set(id, `secret-${id}`);
    const doc = (noteId: string) => {
      let d = this.docs.get(noteId);
      if (!d) this.docs.set(noteId, (d = new Y.Doc()));
      return d;
    };
    const notes: NoteBridge = {
      info: async (noteId) =>
        this.docs.has(noteId) ? { title: this.text(noteId).split("\n")[0], color: "blue" } : null,
      docState: async (noteId) => Y.encodeStateAsUpdate(doc(noteId)),
      stateVector: async (noteId) => Y.encodeStateVector(doc(noteId)),
      diffSince: async (noteId, sv) => Y.encodeStateAsUpdate(doc(noteId), sv),
      applyRemote: async (noteId, update) => {
        const before = toBase64(Y.encodeStateVector(doc(noteId)));
        Y.applyUpdate(doc(noteId), update, "remote");
        return toBase64(Y.encodeStateVector(doc(noteId))) !== before;
      },
      adopt: async (noteId, state, color) => {
        Y.applyUpdate(doc(noteId), state, "remote");
        this.colors.set(noteId, color);
        this.spaces.set(noteId, noteId);
      },
      setSpace: async (noteId, spaceId) => void this.spaces.set(noteId, spaceId),
    };
    this.engine = new ShareEngine({
      myId: id,
      myName: () => name,
      send: (peer, message) => net.send(id, peer, message),
      connectedPeers: () => net.peersOf(id),
      sign: (data) => hmac(id, data),
      verify: async (signer, data, signature) => (await hmac(signer, data)) === signature,
      shares: this.shares,
      notes,
      onChange: () => {},
    });
  }

  /** 사용자가 편집기에서 입력한 것처럼 문서를 바꾸고 엔진에 알린다 */
  async type(noteId: string, text: string) {
    let d = this.docs.get(noteId);
    if (!d) this.docs.set(noteId, (d = new Y.Doc()));
    let update: Uint8Array | null = null;
    const capture = (u: Uint8Array, origin: unknown) => {
      if (origin !== "remote") update = u;
    };
    d.on("update", capture);
    const fragment = d.getXmlFragment(DOC_FIELD);
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    fragment.push([paragraph]);
    d.off("update", capture);
    await this.engine.onLocalUpdate(noteId, update!);
  }

  text(noteId: string) {
    const d = this.docs.get(noteId);
    if (!d) return "";
    return d
      .getXmlFragment(DOC_FIELD)
      .toArray()
      .map((p) => ((p as Y.XmlElement).get(0) as Y.XmlText).toString())
      .join("\n");
  }
}

/** 기기 사이 연결. 메시지는 실제처럼 인코딩·디코딩해 순서대로 비동기 전달한다 */
class Network {
  devices = new Map<string, Device>();
  links = new Set<string>();
  private chain = Promise.resolve();
  log: { from: string; to: string; t: string }[] = [];

  add(id: string, name: string) {
    const d = new Device(id, name, this);
    this.devices.set(id, d);
    return d;
  }

  private key = (a: string, b: string) => [a, b].sort().join("|");

  async connect(a: Device, b: Device) {
    this.links.add(this.key(a.id, b.id));
    await a.engine.onConnected(b.id);
    await b.engine.onConnected(a.id);
    await this.settle();
  }

  disconnect(a: Device, b: Device) {
    this.links.delete(this.key(a.id, b.id));
  }

  peersOf(id: string) {
    return [...this.devices.keys()].filter((o) => o !== id && this.links.has(this.key(id, o)));
  }

  async send(from: string, to: string, message: SyncMessage) {
    if (!this.links.has(this.key(from, to))) throw new Error("not connected");
    const decoded = decodeMessage(encodeMessage(message)) as SyncMessage;
    expect(decoded).not.toBeNull();
    this.log.push({ from, to, t: message.t });
    this.chain = this.chain.then(() => this.devices.get(to)!.engine.handle(from, decoded));
  }

  async settle() {
    for (let i = 0; i < 50; i++) await this.chain;
  }
}

let net: Network;
let owner: Device;
let editor: Device;
let viewer: Device;
const NOTE = "note-1";

async function shareToAll() {
  await owner.type(NOTE, "장보기");
  await owner.engine.share(NOTE, [
    { id: editor.id, name: editor.name, role: "editor" },
    { id: viewer.id, name: viewer.name, role: "viewer" },
  ]);
  await net.settle();
  await editor.engine.acceptOffer(NOTE);
  await viewer.engine.acceptOffer(NOTE);
  await net.settle();
}

beforeEach(() => {
  net = new Network();
  owner = net.add("aaaa", "민지 PC");
  editor = net.add("bbbb", "준호 노트북");
  viewer = net.add("cccc", "서연 PC");
});

describe("ShareEngine", () => {
  it("delivers an offer, and the accepted note matches the owner's", async () => {
    await net.connect(owner, editor);
    await owner.type(NOTE, "장보기");
    await owner.engine.share(NOTE, [{ id: editor.id, name: editor.name, role: "editor" }]);
    await net.settle();

    expect((await editor.shares.inbox()).map((i) => i.noteId)).toEqual([NOTE]);
    expect(editor.text(NOTE)).toBe(""); // 수락 전에는 메모를 만들지 않는다

    await editor.engine.acceptOffer(NOTE);
    await net.settle();
    expect(editor.text(NOTE)).toBe("장보기");
    expect(editor.spaces.get(NOTE)).toBe(NOTE);
    expect(owner.spaces.get(NOTE)).toBe(NOTE);
  });

  it("queues an offer for a friend who is away and delivers it when they meet", async () => {
    await owner.type(NOTE, "회의 메모");
    await owner.engine.share(NOTE, [{ id: editor.id, name: editor.name, role: "editor" }]);
    expect(await owner.shares.outboxFor(editor.id)).toHaveLength(1);

    await net.connect(owner, editor);
    expect(await owner.shares.outboxFor(editor.id)).toHaveLength(0);
    expect(await editor.shares.inbox()).toHaveLength(1);
  });

  it("streams live edits between connected members", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await shareToAll();

    await editor.type(NOTE, "우유");
    await net.settle();
    expect(owner.text(NOTE)).toBe("장보기\n우유");
    expect(viewer.text(NOTE)).toBe("장보기\n우유"); // 소유자가 보기 전용 기기에 전달
  });

  it("merges edits made while apart when the devices meet again", async () => {
    await net.connect(owner, editor);
    await shareToAll();
    net.disconnect(owner, editor);

    await owner.type(NOTE, "A가 따로 씀");
    await editor.type(NOTE, "B가 따로 씀");
    expect(owner.text(NOTE)).not.toContain("B가");

    await net.connect(owner, editor);
    expect(owner.text(NOTE)).toContain("A가 따로 씀");
    expect(owner.text(NOTE)).toContain("B가 따로 씀");
    expect(owner.text(NOTE)).toBe(editor.text(NOTE));
  });

  it("relays edits through another member (A → B → C without A and C meeting)", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await shareToAll();
    net.disconnect(owner, editor);
    net.disconnect(owner, viewer);

    await owner.type(NOTE, "A의 새 내용");
    await net.connect(owner, editor); // A·B 만남
    net.disconnect(owner, editor);
    await net.connect(editor, viewer); // B·C 만남 (A 없음)

    expect(viewer.text(NOTE)).toContain("A의 새 내용");
  });

  it("ignores edits sent by a view-only device", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await shareToAll();

    // 조작된 클라이언트가 보기 전용인데도 편집을 보낸다
    const rogue = new Y.Doc();
    Y.applyUpdate(rogue, Y.encodeStateAsUpdate(viewer.docs.get(NOTE)!));
    let update: Uint8Array | null = null;
    rogue.on("update", (u: Uint8Array) => (update = u));
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText("보기 전용이 몰래 씀")]);
    rogue.getXmlFragment(DOC_FIELD).push([p]);
    await net.send(viewer.id, owner.id, { t: "update", noteId: NOTE, update: toBase64(update!) });
    await net.settle();

    expect(owner.text(NOTE)).not.toContain("몰래");
    // 보기 전용 기기는 자기 문서를 다른 기기에 보내지도 않는다
    await viewer.engine.onLocalUpdate(NOTE, update!);
    await net.settle();
    expect(owner.text(NOTE)).not.toContain("몰래");
  });

  it("rejects a forged or outdated member list", async () => {
    await net.connect(owner, editor);
    await net.connect(editor, viewer);
    await net.connect(owner, viewer);
    await shareToAll();
    const current = (await editor.shares.get(NOTE))!.signed;

    // 편집자가 자기를 owner 로 바꾼 목록을 소유자 서명 없이 만든다
    const forged: SignedMembership = {
      membership: {
        ...current.membership,
        version: current.membership.version + 1,
        members: current.membership.members.map((m) =>
          m.id === viewer.id ? { ...m, role: "editor" } : m,
        ),
      },
      signature: await hmac(editor.id, membershipBytes(current.membership)),
    };
    await net.send(editor.id, viewer.id, { t: "membership", signed: forged });
    await net.settle();
    expect((await viewer.shares.get(NOTE))!.signed.membership.version).toBe(
      current.membership.version,
    );

    // 예전 버전을 다시 보내도 무시한다
    await owner.engine.updateMembers(NOTE, current.membership.members);
    await net.settle();
    const latest = (await viewer.shares.get(NOTE))!.signed.membership.version;
    await net.send(editor.id, viewer.id, { t: "membership", signed: current });
    await net.settle();
    expect((await viewer.shares.get(NOTE))!.signed.membership.version).toBe(latest);
  });

  it("stops syncing with a removed member and tells them", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await shareToAll();
    const members = (await owner.shares.get(NOTE))!.signed.membership.members;

    await owner.engine.updateMembers(
      NOTE,
      members.filter((m) => m.id !== viewer.id),
    );
    await net.settle();
    expect((await viewer.shares.get(NOTE))!.status).toBe("left");
    expect(viewer.spaces.get(NOTE)).toBeNull(); // 받은 사본은 개인 메모로 남는다

    await editor.type(NOTE, "내보낸 뒤 내용");
    await net.settle();
    expect(owner.text(NOTE)).toContain("내보낸 뒤 내용");
    expect(viewer.text(NOTE)).not.toContain("내보낸 뒤 내용");
  });

  it("removes a member who declines or leaves", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await owner.type(NOTE, "x");
    await owner.engine.share(NOTE, [
      { id: editor.id, name: editor.name, role: "editor" },
      { id: viewer.id, name: viewer.name, role: "viewer" },
    ]);
    await net.settle();

    await viewer.engine.declineOffer(NOTE);
    await editor.engine.acceptOffer(NOTE);
    await net.settle();
    let ids = (await owner.shares.get(NOTE))!.signed.membership.members.map((m) => m.id);
    expect(ids).toEqual([owner.id, editor.id]);

    await editor.engine.leave(NOTE);
    await net.settle();
    ids = (await owner.shares.get(NOTE))!.signed.membership.members.map((m) => m.id);
    expect(ids).toEqual([owner.id]);
  });

  it("ends a share, and members who were away learn it from another member", async () => {
    await net.connect(owner, editor);
    await net.connect(owner, viewer);
    await shareToAll();
    net.disconnect(owner, viewer);

    await owner.engine.end(NOTE);
    await net.settle();
    expect((await editor.shares.get(NOTE))!.status).toBe("ended");
    expect((await viewer.shares.get(NOTE))!.status).toBe("active");

    await net.connect(editor, viewer); // 소유자 없이 편집자에게서 전해 듣는다
    expect((await viewer.shares.get(NOTE))!.status).toBe("ended");
    expect(viewer.spaces.get(NOTE)).toBeNull();
  });

  it("re-sharing after an end is not undone by an old 'ended' list", async () => {
    await net.connect(owner, editor);
    await shareToAll();
    await owner.engine.end(NOTE);
    await net.settle();

    await owner.engine.share(NOTE, [{ id: editor.id, name: editor.name, role: "editor" }]);
    await net.settle();
    await editor.engine.acceptOffer(NOTE);
    net.disconnect(owner, editor);
    await net.connect(owner, editor); // hello 교환 시 예전 종료 목록이 오가도
    expect((await owner.shares.get(NOTE))!.status).toBe("active");
    expect((await editor.shares.get(NOTE))!.status).toBe("active");
  });

  it("does not echo updates back and forth forever", async () => {
    await net.connect(owner, editor);
    await net.connect(editor, viewer);
    await net.connect(owner, viewer);
    await shareToAll();
    net.log = [];

    await editor.type(NOTE, "한 번만");
    await net.settle();
    const updates = net.log.filter((l) => l.t === "update").length;
    expect(updates).toBeLessThanOrEqual(4);
    expect(viewer.text(NOTE)).toContain("한 번만");
  });

  it("caps pending offers from one friend", async () => {
    await net.connect(owner, editor);
    for (let i = 0; i < MAX_INBOX_PER_PEER + 5; i++) {
      await owner.type(`n${i}`, `메모 ${i}`);
      await owner.engine.share(`n${i}`, [{ id: editor.id, name: editor.name, role: "editor" }]);
    }
    await net.settle();
    expect(await editor.shares.inbox()).toHaveLength(MAX_INBOX_PER_PEER);

    // 답하면 자리가 생긴다. 같은 메모의 새 제안은 개수와 상관없이 덮어쓴다
    await editor.engine.declineOffer("n0");
    await owner.type("n99", "새 메모");
    await owner.engine.share("n99", [{ id: editor.id, name: editor.name, role: "editor" }]);
    await net.settle();
    expect((await editor.shares.inbox()).map((i) => i.noteId)).toContain("n99");
  });
});

describe("protocol (sync messages)", () => {
  it("rejects malformed member lists", () => {
    const bad = {
      v: 1,
      t: "membership",
      signed: {
        signature: "x",
        membership: {
          noteId: "n",
          version: 1,
          owner: "a",
          status: "active",
          issuedAt: 1,
          members: [
            { id: "a", name: "A", role: "owner" },
            { id: "b", name: "B", role: "owner" }, // 소유자가 둘
          ],
        },
      },
    };
    expect(decodeMessage(new TextEncoder().encode(JSON.stringify(bad)))).toBeNull();
    expect(fromBase64(toBase64(new Uint8Array([1, 2])))).toEqual(new Uint8Array([1, 2]));
  });
});
