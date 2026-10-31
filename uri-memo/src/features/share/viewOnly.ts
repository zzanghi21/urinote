import type { Stores } from "../../data";
import { roleOf } from "./membership";

/** Hub 가 P2P 를 시작할 때 내 기기 ID 를 저장하는 설정 키 */
export const DEVICE_ID_KEY = "device_id";

/**
 * 스티키 창용: 이 메모가 나에게 보기 전용인지.
 * P2P 는 Hub 창에서만 돌므로, Hub 가 저장해 둔 내 기기 ID 와 멤버 목록으로 판단한다.
 */
export async function isViewOnly(stores: Stores, noteId: string): Promise<boolean> {
  if (!stores.shares || !stores.contacts) return false;
  const [record, myId] = await Promise.all([
    stores.shares.get(noteId),
    stores.contacts.getSetting(DEVICE_ID_KEY),
  ]);
  if (!record || record.status !== "active" || !myId) return false;
  return roleOf(record.signed.membership, myId) === "viewer";
}
