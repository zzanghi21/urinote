import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromBase64, toBase64 } from "../domain/noteDoc";

/**
 * 같은 Wi-Fi P2P 계층 (src-tauri/src/p2p). 전송·발견·서명만 하고 메시지 해석은 ShareEngine 이 한다.
 * 데스크톱 앱에서만 쓸 수 있다 (isDesktopApp).
 */

export interface PeerInfo {
  id: string;
  /** 상대가 친구 추가 모드일 때만 있다 */
  name?: string;
}

export type P2pEvent =
  | { type: "discovered"; peer: PeerInfo }
  | { type: "expired"; peer: PeerInfo }
  | { type: "connected"; peer: PeerInfo }
  | { type: "disconnected"; peer: PeerInfo }
  | { type: "message"; from: string; data: Uint8Array };

/** P2P 를 시작하고 내 기기 ID 를 돌려준다 (여러 번 불러도 한 번만 시작) */
export function startP2p(contacts: string[]): Promise<string> {
  return invoke("p2p_start", { contacts });
}

export function setContacts(contacts: string[]): Promise<void> {
  return invoke("p2p_set_contacts", { contacts });
}

/** 친구 추가 모드: 이름을 주면 켜고 광고, null 이면 끈다 */
export function setPairing(name: string | null): Promise<void> {
  return invoke("p2p_set_pairing", { name });
}

export function connectPeer(peer: string): Promise<void> {
  return invoke("p2p_connect", { peer });
}

/** 연결 코드로 받은 연결 정보로 직접 연결하고 상대 기기 ID 를 돌려준다 */
export function connectAddr(addr: string): Promise<string> {
  return invoke("p2p_connect_addr", { addr });
}

/** 기기 표시 이름 기본값 (PC 이름) */
export function defaultDeviceName(): Promise<string> {
  return invoke("p2p_default_name");
}

/** QR 로 보여 줄 내 연결 정보 */
export function myAddr(): Promise<string> {
  return invoke("p2p_my_addr");
}

export function sendTo(peer: string, data: Uint8Array): Promise<void> {
  return invoke("p2p_send", { peer, data: toBase64(data) });
}

export function disconnectPeer(peer: string): Promise<void> {
  return invoke("p2p_disconnect", { peer });
}

export function connectedPeers(): Promise<string[]> {
  return invoke("p2p_connected");
}

export async function sign(data: Uint8Array): Promise<Uint8Array> {
  return fromBase64(await invoke<string>("p2p_sign", { data: toBase64(data) }));
}

export function verify(signer: string, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
  return invoke("p2p_verify", {
    signer,
    data: toBase64(data),
    signature: toBase64(signature),
  });
}

/** P2P 이벤트 구독 (Hub 창 전용). 해제 함수를 돌려준다. */
export async function onP2pEvent(handler: (event: P2pEvent) => void): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<PeerInfo>("p2p://discovered", (e) => handler({ type: "discovered", peer: e.payload })),
    listen<PeerInfo>("p2p://expired", (e) => handler({ type: "expired", peer: e.payload })),
    listen<PeerInfo>("p2p://connected", (e) => handler({ type: "connected", peer: e.payload })),
    listen<PeerInfo>("p2p://disconnected", (e) =>
      handler({ type: "disconnected", peer: e.payload }),
    ),
    listen<{ from: string; data: string }>("p2p://message", (e) =>
      handler({ type: "message", from: e.payload.from, data: fromBase64(e.payload.data) }),
    ),
  ]);
  return () => unlisteners.forEach((fn) => fn());
}
