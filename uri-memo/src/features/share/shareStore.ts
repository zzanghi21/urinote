import { create } from "zustand";
import { openStores } from "../../data";
import type { Contact, ContactsRepository } from "../../data/local/contactsRepo";
import { isDesktopApp } from "../../platform/env";
import * as p2p from "../../platform/p2p";
import { PairingSession, type PairingView } from "./pairing";
import { decodeMessage, encodeMessage, type PairMessage } from "./protocol";

/**
 * 친구 공유 엔진 (Hub 창 전용). S2 범위: P2P 시작, 근처 기기, 친구 등록·관리.
 * 공유 메모 동기화(S3)도 이 엔진에 붙는다.
 */

const DEVICE_NAME_KEY = "device_name";
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
}

export const useShare = create<ShareState>((set, get) => {
  let repo: ContactsRepository | null = null;
  let session: PairingSession | null = null;
  let starting: Promise<void> | null = null;

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
        return;
      case "disconnected":
        set((s) => ({ connected: s.connected.filter((id) => id !== event.peer.id) }));
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
    if (session?.peerId === from) await session.handle(message);
  };

  const start = () => {
    starting ??= (async () => {
      const contacts = get().contacts.map((c) => c.deviceId);
      const myId = await p2p.startP2p(contacts);
      await p2p.onP2pEvent(onEvent);
      set({ myId, started: true, connected: await p2p.connectedPeers() });
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

    async init() {
      if (!isDesktopApp) return;
      try {
        repo = (await openStores()).contacts;
        const name = (await repo?.getSetting(DEVICE_NAME_KEY)) ?? (await p2p.defaultDeviceName());
        set({ deviceName: name });
        await reloadContacts();
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
      const name = peerName ?? get().nearby[peerId]?.name ?? "상대 기기";
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
  };
});

/** 기기 ID 를 사람이 비교하기 쉽게 앞 8자리만 4자씩 끊어 보여 준다 */
export const shortDeviceId = (id: string) => `${id.slice(0, 4)} ${id.slice(4, 8)}`.toUpperCase();
