import * as Y from "yjs";
import type { Stores } from "../../data";
import type { NoteColor } from "../../domain/note";
import { docFromUpdates, plainTextFromDoc, toBase64 } from "../../domain/noteDoc";
import { NoteService } from "../../domain/noteService";
import { emitDocUpdate, emitNoteChanged, P2P_SOURCE } from "../../platform/events";
import type { NoteBridge } from "./shareEngine";

/** 받은 편집으로 제목·검색 캐시를 다시 계산하는 간격 */
const CACHE_DEBOUNCE_MS = 500;

/**
 * 공유 엔진과 앱의 메모 저장소를 잇는다.
 * 받은 업데이트는 문서 로그에 `remote` 로 저장하고 `doc:update`(source=p2p)로 모든 창에 알린다.
 */
export function createNoteBridge(stores: Stores, onNotesChanged: () => void): NoteBridge {
  const service = new NoteService(stores.notes, stores.docs);
  const cacheTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const loadDoc = async (noteId: string) => docFromUpdates(await stores.docs.load(noteId));

  const withDoc = async <T>(noteId: string, fn: (doc: Y.Doc) => T): Promise<T> => {
    const doc = await loadDoc(noteId);
    try {
      return fn(doc);
    } finally {
      doc.destroy();
    }
  };

  const refreshCache = (noteId: string) => {
    clearTimeout(cacheTimers.get(noteId));
    cacheTimers.set(
      noteId,
      setTimeout(async () => {
        cacheTimers.delete(noteId);
        const plainText = await withDoc(noteId, plainTextFromDoc);
        await service.edit(noteId, { plainText });
        emitNoteChanged(noteId);
        onNotesChanged();
      }, CACHE_DEBOUNCE_MS),
    );
  };

  return {
    async info(noteId) {
      const note = await service.get(noteId);
      return note ? { title: note.title, color: note.color } : null;
    },

    docState: (noteId) => withDoc(noteId, (doc) => Y.encodeStateAsUpdate(doc)),
    stateVector: (noteId) => withDoc(noteId, (doc) => Y.encodeStateVector(doc)),
    diffSince: (noteId, sv) => withDoc(noteId, (doc) => Y.encodeStateAsUpdate(doc, sv)),

    async applyRemote(noteId, update) {
      const changed = await withDoc(noteId, (doc) => {
        const before = toBase64(Y.encodeStateVector(doc));
        Y.applyUpdate(doc, update);
        return toBase64(Y.encodeStateVector(doc)) !== before;
      });
      if (!changed) return false;
      await stores.docs.append(noteId, update, "remote");
      emitDocUpdate(noteId, toBase64(update), P2P_SOURCE);
      refreshCache(noteId);
      return true;
    },

    async adopt(noteId: string, state: Uint8Array, color: NoteColor) {
      await stores.docs.append(noteId, state, "remote");
      const plainText = await withDoc(noteId, plainTextFromDoc);
      await service.adoptShared(noteId, plainText, color);
      emitNoteChanged(noteId);
      onNotesChanged();
    },

    async setSpace(noteId, spaceId) {
      await service.setSpace(noteId, spaceId);
      emitNoteChanged(noteId);
      onNotesChanged();
    },
  };
}
