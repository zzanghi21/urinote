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

/** 같은 PC의 다른 창에 본문 Yjs 업데이트를 보낸다 */
const DOC_UPDATE = "doc:update";

interface DocUpdatePayload {
  noteId: string;
  /** base64(Yjs 업데이트) */
  update: string;
  source: string;
}

/** 친구 기기에서 받은 업데이트의 출처 표시. 모든 창(Hub 포함)이 적용한다. */
export const P2P_SOURCE = "p2p";

export function emitDocUpdate(noteId: string, update: string, source = windowLabel) {
  if (!inTauri) return;
  void emit(DOC_UPDATE, { noteId, update, source } satisfies DocUpdatePayload);
}

/** 모든 창의 본문 업데이트 (공유 엔진이 친구 기기로 보낼 편집을 모은다) */
export async function onAnyDocUpdate(
  handler: (noteId: string, update: string, source: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(DOC_UPDATE, (e) =>
    handler(e.payload.noteId, e.payload.update, e.payload.source),
  );
}

/**
 * 다른 창의 본문 업데이트를 받는다. 등록이 끝난 뒤 resolve 되므로,
 * 문서를 DB에서 읽기 전에 await 하면 그 사이의 업데이트를 놓치지 않는다.
 */
export async function onDocUpdateElsewhere(
  noteId: string,
  handler: (update: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(DOC_UPDATE, (e) => {
    if (e.payload.source !== windowLabel && e.payload.noteId === noteId) handler(e.payload.update);
  });
}

/**
 * 커서·이름 표시(awareness). 창 → Hub: 내 커서 (source = 창 이름),
 * Hub → 창: 친구 커서 (source = P2P_SOURCE)
 */
const AWARENESS_UPDATE = "awareness:update";
/** 창 → Hub: 막 연 메모의 친구 커서를 보내 달라 */
const AWARENESS_QUERY = "awareness:query";
/** Hub → 창: 친구 기기가 새로 연결되었으니 내 커서를 다시 보내 달라 */
const AWARENESS_RENEW = "awareness:renew";

export function emitAwareness(noteId: string, update: string, source = windowLabel) {
  if (!inTauri) return;
  void emit(AWARENESS_UPDATE, { noteId, update, source } satisfies DocUpdatePayload);
}

/** 창용: 친구 커서. 등록이 끝난 뒤 resolve 된다 */
export async function onPeerAwareness(
  noteId: string,
  handler: (update: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(AWARENESS_UPDATE, (e) => {
    if (e.payload.source === P2P_SOURCE && e.payload.noteId === noteId) handler(e.payload.update);
  });
}

/** Hub 용: 내 창들의 커서 */
export async function onLocalAwareness(
  handler: (noteId: string, update: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(AWARENESS_UPDATE, (e) => {
    if (e.payload.source !== P2P_SOURCE) handler(e.payload.noteId, e.payload.update);
  });
}

export function emitAwarenessQuery(noteId: string) {
  if (inTauri) void emit(AWARENESS_QUERY, { noteId });
}

export async function onAwarenessQuery(handler: (noteId: string) => void) {
  if (!inTauri) return () => {};
  return listen<{ noteId: string }>(AWARENESS_QUERY, (e) => handler(e.payload.noteId));
}

export function emitAwarenessRenew() {
  if (inTauri) void emit(AWARENESS_RENEW, {});
}

export function onAwarenessRenew(handler: () => void): () => void {
  return subscribe(AWARENESS_RENEW, handler);
}

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  const unlisten = listen<T>(event, (e) => handler(e.payload));
  return () => void unlisten.then((fn) => fn());
}
