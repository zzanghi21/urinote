import * as Y from "yjs";
import { openStores } from "../../data";
import { fromBase64, toBase64 } from "../../domain/noteDoc";
import { emitDocUpdate, onDocUpdateElsewhere } from "../../platform/events";

/** 키 입력마다 DB에 쓰지 않도록 업데이트를 모아서 저장·전송한다 */
const APPEND_DEBOUNCE_MS = 200;

/** DB에서 읽었거나 다른 창에서 받은 업데이트 — 다시 저장·전송하지 않는다 */
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
 * 메모의 Yjs 문서를 연다. 같은 창 안에서는 메모마다 문서 1개를 공유한다.
 * 다른 창과는 `doc:update` 이벤트로 업데이트를 주고받아 실시간 병합한다.
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

/** 저장 대기 중인 본문 업데이트를 모두 저장한다 (창 닫기·앱 종료 직전) */
export function flushAllDocs(): Promise<void> {
  return Promise.all([...sessions.values()].map((s) => s.flush())).then(() => undefined);
}

function createSession(noteId: string): Session {
  const doc = new Y.Doc();
  let pending: Uint8Array[] = [];
  let timer: number | undefined;
  let writing: Promise<void> = Promise.resolve();

  // DB에 먼저 쓰고 나서 다른 창에 알린다. 다른 창이 DB를 읽은 직후에 쓴 업데이트도 이벤트로 받게 된다.
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
    // 구독을 먼저 끝낸 뒤 DB를 읽는다 (그 사이의 업데이트 유실 방지, 중복 적용은 Yjs가 무시)
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
