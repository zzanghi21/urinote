import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./env";

/** Event announcing note changes between windows (hub and stickies) */
const NOTE_CHANGED = "note:changed";

/** Events sent by src-tauri/src/desktop.rs */
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

/** Called when a note changed in another window. Returns an unsubscribe function. */
export function onNoteChangedElsewhere(handler: (id: string) => void): () => void {
  return subscribe<NoteChangedPayload>(NOTE_CHANGED, (payload) => {
    if (payload.source !== windowLabel) handler(payload.id);
  });
}

/** Sends an app event to every window (e.g. app://flush before installing an update) */
export async function emitAppEvent(event: AppEvent) {
  if (inTauri) await emit(event);
}

export function onAppEvent(event: AppEvent, handler: () => void): () => void {
  return subscribe(event, handler);
}

/** Sends a body Yjs update to the other windows on this PC */
const DOC_UPDATE = "doc:update";

interface DocUpdatePayload {
  noteId: string;
  /** base64(Yjs update) */
  update: string;
  source: string;
}

/** Source marker for updates received from friend devices. Every window (hub included) applies them. */
export const P2P_SOURCE = "p2p";

export function emitDocUpdate(noteId: string, update: string, source = windowLabel) {
  if (!inTauri) return;
  void emit(DOC_UPDATE, { noteId, update, source } satisfies DocUpdatePayload);
}

/** Body updates from every window (the share engine collects edits to send to friends) */
export async function onAnyDocUpdate(
  handler: (noteId: string, update: string, source: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(DOC_UPDATE, (e) =>
    handler(e.payload.noteId, e.payload.update, e.payload.source),
  );
}

/**
 * Receives body updates from other windows. Resolves once registered, so awaiting it before
 * reading the document from the DB means no update in between is missed.
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
 * Cursors and names (awareness). Window → hub: my cursor (source = window label),
 * hub → windows: friend cursors (source = P2P_SOURCE)
 */
const AWARENESS_UPDATE = "awareness:update";
/** Window → hub: send the friend cursors for a note that was just opened */
const AWARENESS_QUERY = "awareness:query";
/** Hub → windows: a friend device just connected, send your cursors again */
const AWARENESS_RENEW = "awareness:renew";

export function emitAwareness(noteId: string, update: string, source = windowLabel) {
  if (!inTauri) return;
  void emit(AWARENESS_UPDATE, { noteId, update, source } satisfies DocUpdatePayload);
}

/** For windows: friend cursors. Resolves once registered */
export async function onPeerAwareness(
  noteId: string,
  handler: (update: string) => void,
): Promise<() => void> {
  if (!inTauri) return () => {};
  return listen<DocUpdatePayload>(AWARENESS_UPDATE, (e) => {
    if (e.payload.source === P2P_SOURCE && e.payload.noteId === noteId) handler(e.payload.update);
  });
}

/** For the hub: cursors of my windows */
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
