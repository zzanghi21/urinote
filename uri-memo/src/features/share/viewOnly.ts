import type { Stores } from "../../data";
import { roleOf } from "./membership";

/** Hub 가 P2P 를 시작할 때 내 기기 ID 를 저장하는 설정 키 */
export const DEVICE_ID_KEY = "device_id";
/** 친구에게 보이는 내 기기 이름 (사용자가 바꾼 경우에만 저장) */
export const DEVICE_NAME_KEY = "device_name";

export interface ShareAccess {
  /** 지금 친구와 공유 중 (커서 표시 대상) */
  shared: boolean;
  viewOnly: boolean;
}

/**
 * 스티키 창용: 이 메모의 공유 상태와 내 권한.
 * P2P 는 Hub 창에서만 돌므로, Hub 가 저장해 둔 내 기기 ID 와 멤버 목록으로 판단한다.
 */
export async function shareAccess(stores: Stores, noteId: string): Promise<ShareAccess> {
  const none = { shared: false, viewOnly: false };
  if (!stores.shares || !stores.contacts) return none;
  const [record, myId] = await Promise.all([
    stores.shares.get(noteId),
    stores.contacts.getSetting(DEVICE_ID_KEY),
  ]);
  if (!record || record.status !== "active" || !myId) return none;
  const m = record.signed.membership;
  const role = m.status === "active" ? roleOf(m, myId) : null;
  return { shared: role !== null, viewOnly: role === "viewer" };
}
