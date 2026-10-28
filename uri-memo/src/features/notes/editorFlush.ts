let flushEditor: (() => void) | null = null;

/** 열린 편집기가 저장 대기 중인 입력을 즉시 저장하는 함수를 등록한다. 해제 함수를 반환한다. */
export function registerEditorFlush(flush: () => void) {
  flushEditor = flush;
  return () => {
    if (flushEditor === flush) flushEditor = null;
  };
}

/** 저장 대기 중인 입력을 지금 저장한다 (저장 요청은 동기적으로 큐에 들어간다) */
export function flushPendingEdit() {
  flushEditor?.();
}

/** 편집기 안에 포커스가 있으면 외부 변경으로 내용을 다시 불러오지 않는다 (입력 중 커서 보호) */
export function isEditorFocused() {
  return document.hasFocus() && !!document.activeElement?.closest(".note-editor");
}
