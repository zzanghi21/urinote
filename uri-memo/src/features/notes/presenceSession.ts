import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import type * as Y from "yjs";
import { openStores } from "../../data";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import {
  emitAwareness,
  emitAwarenessQuery,
  onAwarenessRenew,
  onPeerAwareness,
} from "../../platform/events";
import * as p2p from "../../platform/p2p";
import { presenceColor, type PresenceUser } from "../share/presence";
import { DEVICE_ID_KEY, DEVICE_NAME_KEY } from "../share/viewOnly";

/** Batches cursor moves instead of sending each one */
const SEND_THROTTLE_MS = 80;

export interface PresenceHandle {
  awareness: Awareness;
  user: PresenceUser;
  close(): void;
}

/**
 * Opens Awareness for a shared note's editor. My cursor goes to friends through the hub, and
 * friends' cursors arrive only after the hub has checked them.
 */
export async function openPresence(noteId: string, doc: Y.Doc): Promise<PresenceHandle> {
  const user = await myPresenceUser();
  const awareness = new Awareness(doc);
  let timer: number | undefined;

  const sendNow = () => {
    window.clearTimeout(timer);
    timer = undefined;
    emitAwareness(noteId, toBase64(encodeAwarenessUpdate(awareness, [awareness.clientID])));
  };
  const onUpdate = (_change: unknown, origin: unknown) => {
    if (origin === "local" && timer === undefined) {
      timer = window.setTimeout(sendNow, SEND_THROTTLE_MS);
    }
  };
  awareness.on("update", onUpdate);

  const offPeers = await onPeerAwareness(noteId, (update) =>
    applyAwarenessUpdate(awareness, fromBase64(update), "peer"),
  );
  const offRenew = onAwarenessRenew(sendNow);
  emitAwarenessQuery(noteId);

  return {
    awareness,
    user,
    close() {
      awareness.off("update", onUpdate);
      offPeers();
      offRenew();
      // remove my cursor from friends' screens right away
      awareness.setLocalState(null);
      sendNow();
      awareness.destroy();
    },
  };
}

let cachedUser: Promise<PresenceUser> | null = null;

/** My display name and color. Friends see the name from their own friend list instead */
function myPresenceUser(): Promise<PresenceUser> {
  cachedUser ??= (async () => {
    const { contacts } = await openStores();
    const [id, name] = await Promise.all([
      contacts?.getSetting(DEVICE_ID_KEY),
      contacts?.getSetting(DEVICE_NAME_KEY),
    ]);
    return {
      name: name ?? (await p2p.defaultDeviceName()),
      color: presenceColor(id ?? ""),
    };
  })();
  return cachedUser;
}
