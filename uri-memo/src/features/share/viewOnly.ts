import type { Stores } from "../../data";
import { roleOf } from "./membership";

/** Settings key where the hub stores my device ID when starting P2P */
export const DEVICE_ID_KEY = "device_id";
/** My device name as friends see it (stored only if the user changed it) */
export const DEVICE_NAME_KEY = "device_name";

export interface ShareAccess {
  /** Currently shared with friends (cursors are shown) */
  shared: boolean;
  viewOnly: boolean;
}

/**
 * For sticky windows: this note's sharing state and my permission.
 * P2P runs only in the hub, so this uses the device ID the hub stored plus the member list.
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
