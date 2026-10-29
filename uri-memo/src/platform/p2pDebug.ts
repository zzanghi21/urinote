import { onP2pEvent, startP2p } from "./p2p";

/**
 * 개발용 점검: `VITE_P2P_DEBUG=1 npm run tauri dev` 로 실행하면 P2P 를 시작하고
 * 발견·연결 이벤트를 콘솔(Vite 터미널)에 남긴다. S2 친구 추가 화면이 생기기 전까지의 확인 수단.
 */
export async function startP2pDebug() {
  const id = await startP2p([]);
  console.warn(`[p2p] started, device id ${id}`);
  await onP2pEvent((event) => {
    if (event.type === "message") {
      console.warn(`[p2p] message from ${event.from.slice(0, 10)}… (${event.data.length} bytes)`);
    } else {
      console.warn(`[p2p] ${event.type} ${event.peer.id.slice(0, 10)}… ${event.peer.name ?? ""}`);
    }
  });
}
