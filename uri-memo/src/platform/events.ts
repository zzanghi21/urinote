import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./env";

/** 창(Hub·스티키)끼리 메모 변경을 알리는 이벤트 */
const NOTE_CHANGED = "note:changed";

/** src-tauri/src/desktop.rs 가 보내는 이벤트 */
export type AppEvent = "app://new-sticky" | "app://flush";

interface NoteChangedPayload {
  id: string;
  source: string;
}

export const windowLabel = inTauri ? getCurrentWindow().label : "main";

export function emitNoteChanged(id: string) {
  if (!inTauri) return;
  void emit(NOTE_CHANGED, { id, source: windowLabel } satisfies NoteChangedPayload);
}

/** 다른 창에서 메모가 바뀌었을 때 호출된다. 해제 함수를 반환한다. */
export function onNoteChangedElsewhere(handler: (id: string) => void): () => void {
  return subscribe<NoteChangedPayload>(NOTE_CHANGED, (payload) => {
    if (payload.source !== windowLabel) handler(payload.id);
  });
}

export function onAppEvent(event: AppEvent, handler: () => void): () => void {
  return subscribe(event, handler);
}

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  const unlisten = listen<T>(event, (e) => handler(e.payload));
  return () => void unlisten.then((fn) => fn());
}
