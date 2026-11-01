let flushEditor: (() => void) | null = null;

/** Registers a function that saves an open editor's pending input immediately. Returns an unregister function. */
export function registerEditorFlush(flush: () => void) {
  flushEditor = flush;
  return () => {
    if (flushEditor === flush) flushEditor = null;
  };
}

/** Saves pending input now (the save request is queued synchronously) */
export function flushPendingEdit() {
  flushEditor?.();
}
