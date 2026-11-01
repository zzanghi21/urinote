import { t } from "../../i18n";
import { create } from "zustand";
import { openStores } from "../../data";
import type { Contact, ContactsRepository } from "../../data/local/contactsRepo";
import { isDesktopApp } from "../../platform/env";
import * as p2p from "../../platform/p2p";
import { PairingSession, type PairingView } from "./pairing";
import type { InboxItem, ShareRecord } from "../../data/local/sharesRepo";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import {
  emitAwareness,
  emitAwarenessRenew,
  emitNoteChanged,
  onAnyDocUpdate,
  onAwarenessQuery,
  onLocalAwareness,
  P2P_SOURCE,
} from "../../platform/events";
import { useNotes } from "../notes/notesStore";
import type { Member } from "./membership";
import { createNoteBridge } from "./noteBridge";
import { PresenceHub } from "./presence";
import { decodeMessage, encodeMessage, type PairMessage, type SyncMessage } from "./protocol";
import { ShareEngine, type Invitee } from "./shareEngine";
import { DEVICE_ID_KEY, DEVICE_NAME_KEY } from "./viewOnly";

/**
 * 친구 공유 (Hub 창 전용): P2P 시작, 근처 기기, 친구 등록·관리(S2), 메모 공유·동기화(S3),
 * 함께 편집 중인 친구의 커서 표시(S4).
 */

const CONNECT_CODE_PREFIX = "URINOTE-";

export interface NearbyPeer {
  id: string;
  name: string;
}

interface ShareState {
  /** 데스크톱 앱에서만 true */
  available: boolean;
  started: boolean;
  error: string | null;
  myId: string | null;
  deviceName: string;
  contacts: Contact[];
  connected: string[];
  /** 친구 추가 화면을 연 근처 기기 (표시 이름을 광고 중인 기기) */
  nearby: Record<string, NearbyPeer>;
  dialogOpen: boolean;
  pairing: PairingView | null;
  /** 공유 중이거나 공유했던 메모 (noteId → 기록) */
  shares: Record<string, ShareRecord>;
  /** 받은 공유 제안 */
  inbox: IncomingOffer[];
  /** 공유 설정 창이 열린 메모 */
  shareDialogNoteId: string | null;

  /** 앱 시작 시: 친구가 있으면 P2P 를 바로 켜서 친구 기기와 자동 연결 */
  init(): Promise<void>;
  openDialog(): Promise<void>;
  closeDialog(): Promise<void>;
  requestPair(peerId: string, peerName?: string): Promise<void>;
  acceptPair(): Promise<void>;
  confirmPair(same: boolean): Promise<void>;
  cancelPair(): Promise<void>;
  dismissPairing(): void;
  setDeviceName(name: string): Promise<void>;
  renameContact(deviceId: string, name: string): Promise<void>;
  removeContact(deviceId: string): Promise<void>;
  myConnectCode(): Promise<string>;
  connectWithCode(code: string): Promise<void>;

  openShareDialog(noteId: string): Promise<void>;
  closeShareDialog(): void;
  shareNote(noteId: string, invitees: Invitee[]): Promise<void>;
  setMembers(noteId: string, members: Member[]): Promise<void>;
  endShare(noteId: string): Promise<void>;
  leaveShare(noteId: string): Promise<void>;
  /** 공유 메모를 영구 삭제하기 전: 소유자는 공유 종료, 멤버는 나가기 (DESIGN.md 4.9.7) */
  beforeDeleteForever(noteId: string): Promise<void>;
  acceptOffer(noteId: string): Promise<void>;
  declineOffer(noteId: string): Promise<void>;
  forgetShare(noteId: string): Promise<void>;
}

export interface IncomingOffer {
  noteId: string;
  fromId: string;
  fromName: string;
  title: string;
}

export const useShare = create<ShareState>((set, get) => {
  let repo: ContactsRepository | null = null;
  let session: PairingSession | null = null;
  let starting: Promise<void> | null = null;
  let engine: ShareEngine | null = null;
  let presence: PresenceHub | null = null;
  /** 엔진 작업은 도착 순서대로 하나씩 처리한다 (멤버 목록 갱신 → 동기화 요청 순서 보장) */
  let engineQueue: Promise<unknown> = Promise.resolve();
  const runEngine = (task: (e: ShareEngine) => Promise<unknown>) => {
    const result = engineQueue.then(() => (engine ? task(engine) : undefined));
    engineQueue = result.catch((e: unknown) => console.error("[share]", e));
    return result;
  };

  const setError = (e: unknown) => set({ error: e instanceof Error ? e.message : String(e) });

  const send = (peerId: string, message: PairMessage) => p2p.sendTo(peerId, encodeMessage(message));

  const reloadContacts = async () => {
    const contacts = (await repo?.list()) ?? [];
    set({ contacts });
    if (get().started) await p2p.setContacts(contacts.map((c) => c.deviceId));
  };

  const newSession = (
    create: (deps: Parameters<typeof PairingSession.outgoing>[0]) => PairingSession,
  ) => {
    session = create({
      myId: get().myId!,
      myName: get().deviceName,
      send,
      onChange: (view) => set({ pairing: view }),
      onPaired: (peerId, peerName) =>
        void (async () => {
          await repo?.upsert({
            deviceId: peerId,
            name: peerName,
            pairedAt: Date.now(),
            lastSeen: Date.now(),
          });
          await reloadContacts();
        })(),
    });
    return session;
  };

  const onEvent = (event: p2p.P2pEvent) => {
    switch (event.type) {
      case "discovered":
        if (event.peer.name) {
          set((s) => ({
            nearby: { ...s.nearby, [event.peer.id]: { id: event.peer.id, name: event.peer.name! } },
          }));
        } else if (get().nearby[event.peer.id]) {
          // 상대가 친구 추가 화면을 닫았다
          set((s) => {
            const nearby = { ...s.nearby };
            delete nearby[event.peer.id];
            return { nearby };
          });
        }
        return;
      case "expired":
        set((s) => {
          const nearby = { ...s.nearby };
          delete nearby[event.peer.id];
          return { nearby };
        });
        return;
      case "connected":
        set((s) => ({ connected: [...new Set([...s.connected, event.peer.id])] }));
        void repo?.touch(event.peer.id, Date.now());
        void runEngine((e) => e.onConnected(event.peer.id));
        // 새로 연결된 친구에게 내 창들의 커서를 보낸다
        emitAwarenessRenew();
        return;
      case "disconnected":
        set((s) => ({ connected: s.connected.filter((id) => id !== event.peer.id) }));
        presence?.onDisconnected(event.peer.id);
        if (session?.peerId === event.peer.id && !session.finished) {
          void session.handle({ t: "pair-cancel", reason: "연결이 끊어졌습니다" });
        }
        return;
      case "message":
        void onMessage(event.from, event.data);
        return;
    }
  };

  const onMessage = async (from: string, data: Uint8Array) => {
    const message = decodeMessage(data);
    if (!message) return; // 형식이 맞지 않는 데이터는 버린다
    if (message.t === "pair-request") {
      if (!get().dialogOpen) {
        await send(from, { t: "pair-cancel", reason: "상대가 친구 추가 화면을 닫았습니다" });
        return;
      }
      if (session && !session.finished && session.peerId !== from) {
        await send(from, { t: "pair-cancel", reason: "상대가 다른 기기와 친구 등록 중입니다" });
        return;
      }
      newSession((deps) => PairingSession.fromRequest(deps, from, message));
      return;
    }
    if (message.t.startsWith("pair-")) {
      if (session?.peerId === from) await session.handle(message as PairMessage);
      return;
    }
    // 친구 추가 화면이 열려 있으면 친구가 아닌 기기도 연결될 수 있다. 공유 메시지는 친구에게서만 받는다
    if (!get().contacts.some((c) => c.deviceId === from)) return;
    if (message.t === "awareness") {
      await presence
        ?.onRemote(from, message.noteId, message.update)
        .catch((e: unknown) => console.error("[presence]", e));
      return;
    }
    await runEngine((e) => e.handle(from, message as SyncMessage));
  };

  const reloadShares = async () => {
    const stores = await openStores();
    if (!stores.shares) return;
    const records = await stores.shares.list();
    const contacts = new Map(get().contacts.map((c) => [c.deviceId, c.name]));
    const inbox = (await stores.shares.inbox()).map((item: InboxItem) => {
      const offer = decodeMessage(new TextEncoder().encode(item.payload));
      const members = offer?.t === "offer" ? offer.signed.membership.members : [];
      return {
        noteId: item.noteId,
        fromId: item.fromId,
        fromName:
          contacts.get(item.fromId) ?? members.find((m) => m.id === item.fromId)?.name ?? t("친구"),
        title: offer?.t === "offer" ? offer.title : "",
      };
    });
    set({ shares: Object.fromEntries(records.map((r) => [r.noteId, r])), inbox });
    // 권한이 바뀌었을 수 있으니 스티키 창들이 다시 읽게 한다
    for (const r of records) emitNoteChanged(r.noteId);
  };

  const refreshNotes = () => void useNotes.getState().refresh();

  const start = () => {
    starting ??= (async () => {
      const contacts = get().contacts.map((c) => c.deviceId);
      const myId = await p2p.startP2p(contacts);
      const stores = await openStores();
      if (stores.shares) {
        engine = new ShareEngine({
          myId,
          myName: () => get().deviceName,
          send: (peer, message) => p2p.sendTo(peer, encodeMessage(message)),
          connectedPeers: () => get().connected,
          sign: async (data) => toBase64(await p2p.sign(data)),
          verify: (signer, data, signature) => p2p.verify(signer, data, fromBase64(signature)),
          shares: stores.shares,
          notes: createNoteBridge(stores, refreshNotes),
          onChange: () => void reloadShares(),
        });
        const hub = new PresenceHub({
          myId,
          shares: stores.shares,
          connectedPeers: () => get().connected,
          send: (peer, message) => p2p.sendTo(peer, encodeMessage(message)),
          toWindows: (noteId, update) => emitAwareness(noteId, update, P2P_SOURCE),
          nameOf: (id) => get().contacts.find((c) => c.deviceId === id)?.name,
        });
        presence = hub;
        await onLocalAwareness(
          (noteId, update) =>
            void hub.onLocal(noteId, update).catch((e: unknown) => console.error("[presence]", e)),
        );
        await onAwarenessQuery((noteId) => hub.query(noteId));
      }
      await p2p.onP2pEvent(onEvent);
      // 내 창들(Hub·스티키)에서 생긴 편집을 친구 기기로 보낸다. 친구에게서 받은 것(p2p)은 제외
      await onAnyDocUpdate((noteId, update, source) => {
        if (source !== P2P_SOURCE)
          void runEngine((e) => e.onLocalUpdate(noteId, fromBase64(update)));
      });
      // 스티키 창이 보기 전용 여부를 판단할 수 있도록 내 기기 ID 를 남긴다
      await repo?.setSetting(DEVICE_ID_KEY, myId);
      set({ myId, started: true, connected: await p2p.connectedPeers() });
      for (const peer of get().connected) void runEngine((e) => e.onConnected(peer));
    })().catch((e: unknown) => {
      starting = null;
      throw e;
    });
    return starting;
  };

  return {
    available: isDesktopApp,
    started: false,
    error: null,
    myId: null,
    deviceName: "",
    contacts: [],
    connected: [],
    nearby: {},
    dialogOpen: false,
    pairing: null,
    shares: {},
    inbox: [],
    shareDialogNoteId: null,

    async init() {
      if (!isDesktopApp) return;
      try {
        repo = (await openStores()).contacts;
        const name = (await repo?.getSetting(DEVICE_NAME_KEY)) ?? (await p2p.defaultDeviceName());
        set({ deviceName: name });
        await reloadContacts();
        await reloadShares();
        // 친구가 없는 동안에는 P2P 를 켜지 않는다 (방화벽 확인 창도 친구 추가를 처음 열 때 뜬다)
        if (get().contacts.length > 0) await start();
      } catch (e) {
        setError(e);
      }
    },

    async openDialog() {
      set({ dialogOpen: true, error: null });
      try {
        await start();
        await p2p.setPairing(get().deviceName);
      } catch (e) {
        setError(e);
      }
    },

    async closeDialog() {
      set({ dialogOpen: false, nearby: {} });
      if (session && !session.finished) await session.cancel("상대가 친구 추가 화면을 닫았습니다");
      session = null;
      set({ pairing: null });
      if (get().started) await p2p.setPairing(null).catch(setError);
    },

    async requestPair(peerId, peerName) {
      if (session && !session.finished) return;
      set({ error: null });
      const name = peerName ?? get().nearby[peerId]?.name ?? t("상대 기기");
      const s = newSession((deps) => PairingSession.outgoing(deps, peerId, name));
      set({ pairing: s.view });
      try {
        await p2p.connectPeer(peerId);
        await s.begin();
      } catch (e) {
        await s.cancel(e instanceof Error ? e.message : String(e));
      }
    },

    async acceptPair() {
      await session?.accept();
    },

    async confirmPair(same) {
      await session?.confirm(same);
    },

    async cancelPair() {
      await session?.cancel("상대가 취소했습니다");
    },

    dismissPairing() {
      if (session && !session.finished) return;
      session = null;
      set({ pairing: null });
    },

    async setDeviceName(name) {
      const trimmed = name.trim().slice(0, 64);
      if (!trimmed) return;
      set({ deviceName: trimmed });
      await repo?.setSetting(DEVICE_NAME_KEY, trimmed);
      if (get().dialogOpen && get().started) await p2p.setPairing(trimmed);
    },

    async renameContact(deviceId, name) {
      const trimmed = name.trim().slice(0, 64);
      if (!trimmed) return;
      await repo?.rename(deviceId, trimmed);
      await reloadContacts();
    },

    async removeContact(deviceId) {
      await repo?.remove(deviceId);
      await reloadContacts();
      if (get().started) await p2p.disconnectPeer(deviceId);
    },

    async myConnectCode() {
      await start();
      return CONNECT_CODE_PREFIX + btoa(await p2p.myAddr());
    },

    async connectWithCode(code) {
      const trimmed = code.replace(/\s+/g, "");
      if (!trimmed.startsWith(CONNECT_CODE_PREFIX)) {
        set({ error: "Urinote 연결 코드가 아닙니다" });
        return;
      }
      let addr: string;
      try {
        addr = atob(trimmed.slice(CONNECT_CODE_PREFIX.length));
      } catch {
        set({ error: "연결 코드가 손상되었습니다" });
        return;
      }
      try {
        const peerId = await p2p.connectAddr(addr);
        await get().requestPair(peerId);
      } catch (e) {
        setError(e);
      }
    },

    async openShareDialog(noteId) {
      set({ shareDialogNoteId: noteId, error: null });
      try {
        await start();
        await reloadShares();
      } catch (e) {
        setError(e);
      }
    },

    closeShareDialog() {
      set({ shareDialogNoteId: null });
    },

    async shareNote(noteId, invitees) {
      await start();
      await runEngine((e) => e.share(noteId, invitees)).catch((e) => set({ error: errorText(e) }));
    },

    async setMembers(noteId, members) {
      await runEngine((e) => e.updateMembers(noteId, members)).catch((e) =>
        set({ error: errorText(e) }),
      );
    },

    async endShare(noteId) {
      await runEngine((e) => e.end(noteId)).catch((e) => set({ error: errorText(e) }));
    },

    async leaveShare(noteId) {
      await runEngine((e) => e.leave(noteId)).catch((e) => set({ error: errorText(e) }));
    },

    async beforeDeleteForever(noteId) {
      const record = get().shares[noteId];
      if (!record || record.status !== "active") return;
      if (record.signed.membership.owner === get().myId) await get().endShare(noteId);
      else await get().leaveShare(noteId);
    },

    async acceptOffer(noteId) {
      await start();
      await runEngine((e) => e.acceptOffer(noteId));
    },

    async declineOffer(noteId) {
      await start();
      await runEngine((e) => e.declineOffer(noteId));
    },

    async forgetShare(noteId) {
      await runEngine((e) => e.forget(noteId));
    },
  };
});

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 기기 ID 를 사람이 비교하기 쉽게 앞 8자리만 4자씩 끊어 보여 준다 */
export const shortDeviceId = (id: string) => `${id.slice(0, 4)} ${id.slice(4, 8)}`.toUpperCase();
