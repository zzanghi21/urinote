import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromBase64, toBase64 } from "../domain/noteDoc";

/**
 * Same-Wi-Fi P2P layer (src-tauri/src/p2p). Handles transport, discovery and signing only;
 * ShareEngine interprets the messages. Desktop app only (isDesktopApp).
 */

export interface PeerInfo {
  id: string;
  /** Present only while the peer is in Add-a-friend mode */
  name?: string;
}

export type P2pEvent =
  | { type: "discovered"; peer: PeerInfo }
  | { type: "expired"; peer: PeerInfo }
  | { type: "connected"; peer: PeerInfo }
  | { type: "disconnected"; peer: PeerInfo }
  | { type: "message"; from: string; data: Uint8Array };

/** Starts P2P and returns my device ID (starts only once even if called repeatedly) */
export function startP2p(contacts: string[]): Promise<string> {
  return invoke("p2p_start", { contacts });
}

export function setContacts(contacts: string[]): Promise<void> {
  return invoke("p2p_set_contacts", { contacts });
}

/** Add-a-friend mode: on and advertising with a name, off with null */
export function setPairing(name: string | null): Promise<void> {
  return invoke("p2p_set_pairing", { name });
}

export function connectPeer(peer: string): Promise<void> {
  return invoke("p2p_connect", { peer });
}

/** Connects directly using a connection code's info and returns the peer's device ID */
export function connectAddr(addr: string): Promise<string> {
  return invoke("p2p_connect_addr", { addr });
}

/** Default device display name (the PC name) */
export function defaultDeviceName(): Promise<string> {
  return invoke("p2p_default_name");
}

/** My connection info, to show as a QR code */
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

/** Subscribes to P2P events (hub window only). Returns an unsubscribe function. */
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
