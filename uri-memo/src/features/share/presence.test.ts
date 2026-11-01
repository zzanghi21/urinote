import { beforeEach, describe, expect, it } from "vitest";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";
import { MemorySharesRepository } from "../../data/local/sharesRepo";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import type { Membership } from "./membership";
import {
  encodeAwarenessEntries,
  parseAwarenessUpdate,
  presenceColor,
  PresenceHub,
} from "./presence";
import type { SyncMessage } from "./protocol";

const NOTE = "note-1";
const ME = "aaaa";
const FRIEND = "bbbb";
const OTHER = "cccc";
const STRANGER = "zzzz";

/** Simulates a friend window's Awareness: stores a cursor position as relative positions */
function friendWindow(name = "가짜 이름", color = "#000000") {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "hello");
  const awareness = new Awareness(doc);
  const pos = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(doc.getText("t"), 2));
  awareness.setLocalState({ user: { name, color }, cursor: { anchor: pos, head: pos }, extra: 1 });
  const update = () => toBase64(encodeAwarenessUpdate(awareness, [awareness.clientID]));
  return { awareness, update };
}

let shares: MemorySharesRepository;
let sent: { peer: string; message: SyncMessage }[];
let toWindows: { noteId: string; update: string }[];
let connected: string[];
let hub: PresenceHub;

async function saveShare(status: Membership["status"] = "active") {
  await shares.save({
    noteId: NOTE,
    status: status === "active" ? "active" : "ended",
    signed: {
      signature: "sig",
      membership: {
        noteId: NOTE,
        version: 1,
        owner: ME,
        status,
        issuedAt: 1,
        members: [
          { id: ME, name: "나", role: "owner" },
          { id: FRIEND, name: "준호 (스스로 붙인 이름)", role: "viewer" },
          { id: OTHER, name: "서연", role: "editor" },
        ],
      },
    },
  });
}

/** Applies the updates sent to windows to a window's Awareness */
function windowStates() {
  const mine = new Awareness(new Y.Doc());
  for (const { update } of toWindows) applyAwarenessUpdate(mine, fromBase64(update), "peer");
  const states = new Map(mine.getStates());
  states.delete(mine.clientID);
  mine.destroy();
  return states;
}

beforeEach(async () => {
  shares = new MemorySharesRepository();
  sent = [];
  toWindows = [];
  connected = [FRIEND, OTHER, STRANGER];
  hub = new PresenceHub({
    myId: ME,
    shares,
    connectedPeers: () => connected,
    send: async (peer, message) => void sent.push({ peer, message }),
    toWindows: (noteId, update) => void toWindows.push({ noteId, update }),
    nameOf: (id) => (id === FRIEND ? "준호" : undefined),
  });
  await saveShare();
});

describe("PresenceHub", () => {
  it("shows a friend's cursor with my name and color for them, not theirs", async () => {
    const friend = friendWindow();
    await hub.onRemote(FRIEND, NOTE, friend.update());

    const state = windowStates().get(friend.awareness.clientID) as Record<string, unknown>;
    expect(state.user).toEqual({ name: "준호", color: presenceColor(FRIEND) });
    const original = friend.awareness.getLocalState()!.cursor;
    const cursor = state.cursor as typeof original;
    expect(Y.createRelativePositionFromJSON(cursor.anchor)).toEqual(
      Y.createRelativePositionFromJSON(original.anchor),
    );
    expect(Y.createRelativePositionFromJSON(cursor.head)).toEqual(
      Y.createRelativePositionFromJSON(original.head),
    );
    expect(state.extra).toBeUndefined(); // unknown fields are dropped
  });

  it("ignores cursors from non-members and for notes that are no longer shared", async () => {
    await hub.onRemote(STRANGER, NOTE, friendWindow().update());
    expect(toWindows).toHaveLength(0);

    await saveShare("ended");
    await hub.onRemote(FRIEND, NOTE, friendWindow().update());
    expect(toWindows).toHaveLength(0);
  });

  it("does not let one friend move or remove another friend's cursor", async () => {
    const other = friendWindow();
    await hub.onRemote(OTHER, NOTE, other.update());
    // FRIEND sends a "remove" using OTHER's cursor ID
    const forged = encodeAwarenessEntries([
      { clientID: other.awareness.clientID, clock: 99, state: null },
    ]);
    await hub.onRemote(FRIEND, NOTE, toBase64(forged));
    expect(toWindows).toHaveLength(1);
    expect(windowStates().has(other.awareness.clientID)).toBe(true);
  });

  it("does not let a friend overwrite my own windows' cursors", async () => {
    const mine = friendWindow();
    await hub.onLocal(NOTE, mine.update());
    const forged = encodeAwarenessEntries([
      { clientID: mine.awareness.clientID, clock: 99, state: null },
    ]);
    await hub.onRemote(FRIEND, NOTE, toBase64(forged));
    expect(toWindows).toHaveLength(0);
  });

  it("limits how many cursors one friend can create", async () => {
    for (let i = 0; i < 12; i++) await hub.onRemote(FRIEND, NOTE, friendWindow().update());
    expect(windowStates().size).toBe(8);
  });

  it("removes a friend's cursor as soon as they disconnect", async () => {
    const friend = friendWindow();
    await hub.onRemote(FRIEND, NOTE, friend.update());
    hub.onDisconnected(FRIEND);
    expect(windowStates().has(friend.awareness.clientID)).toBe(false);
  });

  it("forwards a closing window's removal so the cursor disappears for friends", async () => {
    const friend = friendWindow();
    await hub.onRemote(FRIEND, NOTE, friend.update());
    removeAwarenessStates(friend.awareness, [friend.awareness.clientID], "local");
    await hub.onRemote(FRIEND, NOTE, friend.update());
    expect(windowStates().has(friend.awareness.clientID)).toBe(false);
  });

  it("sends my cursor only to connected members", async () => {
    connected = [FRIEND, STRANGER];
    await hub.onLocal(NOTE, friendWindow().update());
    expect(sent.map((s) => s.peer)).toEqual([FRIEND]);
    expect(sent[0].message.t).toBe("awareness");

    sent = [];
    await hub.onLocal("not-shared", friendWindow().update());
    expect(sent).toHaveLength(0);
  });

  it("answers a newly opened window with the cursors it already knows", async () => {
    const friend = friendWindow();
    await hub.onRemote(FRIEND, NOTE, friend.update());
    toWindows = [];
    hub.query(NOTE);
    expect(windowStates().has(friend.awareness.clientID)).toBe(true);
  });
});

describe("parseAwarenessUpdate", () => {
  it("rejects malformed data and drops bad cursor positions", () => {
    expect(parseAwarenessUpdate(new Uint8Array([0xff, 0xff]))).toBeNull();
    // trailing garbage bytes
    const ok = encodeAwarenessEntries([{ clientID: 1, clock: 1, state: null }]);
    expect(parseAwarenessUpdate(new Uint8Array([...ok, 7]))).toBeNull();
    // valid state JSON but a malformed cursor → no cursor
    const weird = new Awareness(new Y.Doc());
    weird.setLocalState({ cursor: { anchor: { item: { client: "x" } }, head: 5 } });
    const parsed = parseAwarenessUpdate(encodeAwarenessUpdate(weird, [weird.clientID]));
    expect(parsed?.[0].state?.cursor).toBeNull();
    weird.destroy();
  });
});
