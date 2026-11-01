import * as Y from "yjs";
import { openStores } from "../../data";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import { emitDocUpdate, onDocUpdateElsewhere } from "../../platform/events";

/** Batches updates so the DB isn't written on every keystroke */
const APPEND_DEBOUNCE_MS = 200;

/** Updates read from the DB or received from other windows — never saved or sent again */
const LOAD = Symbol("load");
const OTHER_WINDOW = Symbol("other-window");

interface Session {
  doc: Y.Doc;
  refs: number;
  ready: Promise<void>;
  flush(): Promise<void>;
  dispose(): void;
}

const sessions = new Map<string, Session>();

/**
 * Opens a note's Yjs document. Within one window, each note shares a single document.
 * Updates are exchanged with other windows via the `doc:update` event and merged live.
 */
export async function acquireDoc(noteId: string): Promise<{ doc: Y.Doc; release(): void }> {
  let session = sessions.get(noteId);
  if (!session) {
    session = createSession(noteId);
    sessions.set(noteId, session);
  }
  session.refs++;
  await session.ready;

  let released = false;
  const current = session;
  return {
    doc: current.doc,
    release() {
      if (released) return;
      released = true;
      if (--current.refs > 0) return;
      sessions.delete(noteId);
      void current.flush().finally(() => current.dispose());
    },
  };
}

/** Saves all pending body updates (right before closing a window or quitting) */
export function flushAllDocs(): Promise<void> {
  return Promise.all([...sessions.values()].map((s) => s.flush())).then(() => undefined);
}

function createSession(noteId: string): Session {
  const doc = new Y.Doc();
  let pending: Uint8Array[] = [];
  let timer: number | undefined;
  let writing: Promise<void> = Promise.resolve();

  // Write to the DB first, then notify other windows, so a window that just read the DB still gets later updates via the event.
  const flush = () => {
    window.clearTimeout(timer);
    if (pending.length === 0) return writing;
    const update = Y.mergeUpdates(pending);
    pending = [];
    writing = writing.then(async () => {
      const { docs } = await openStores();
      await docs.append(noteId, update, "local");
      emitDocUpdate(noteId, toBase64(update));
    });
    return writing;
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOAD || origin === OTHER_WINDOW) return;
    pending.push(update);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), APPEND_DEBOUNCE_MS);
  };
  doc.on("update", onUpdate);

  let unlisten: () => void = () => {};
  const ready = (async () => {
    // Subscribe before reading the DB (no updates lost in between; Yjs ignores duplicates)
    unlisten = await onDocUpdateElsewhere(noteId, (update) =>
      Y.applyUpdate(doc, fromBase64(update), OTHER_WINDOW),
    );
    const { docs } = await openStores();
    for (const update of await docs.load(noteId)) Y.applyUpdate(doc, update, LOAD);
  })();

  return {
    doc,
    refs: 0,
    ready,
    flush,
    dispose() {
      unlisten();
      doc.off("update", onUpdate);
      doc.destroy();
    },
  };
}
