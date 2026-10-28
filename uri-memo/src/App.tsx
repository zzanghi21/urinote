import { useEffect, useRef, useState } from "react";
import { openStores } from "./data";
import { NoteService } from "./domain/noteService";
import { EditorPane } from "./features/notes/EditorPane";
import { useNotes } from "./features/notes/notesStore";
import { Sidebar } from "./features/notes/Sidebar";
import { isDesktopApp } from "./platform/env";
import { onAppEvent, onNoteChangedElsewhere } from "./platform/events";
import { restoreOpenStickies } from "./platform/stickyWindows";
import "./App.css";

/** App.css 의 2단 레이아웃 기준과 같아야 한다 */
const TWO_PANE_QUERY = "(min-width: 720px)";
const COMPACT_INTERVAL_MS = 5 * 60 * 1000;

function App() {
  const ready = useNotes((s) => s.ready);
  const hasSelection = useNotes((s) => s.selectedId !== null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openStores()
      .then(({ notes, docs }) =>
        useNotes
          .getState()
          .init(new NoteService(notes, docs), window.matchMedia(TWO_PANE_QUERY).matches),
      )
      .then(() => (isDesktopApp ? restoreOpenStickies() : undefined))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // 스티키 창의 변경 반영, 트레이·전역 단축키의 "새 메모"
  useEffect(() => {
    if (!ready) return;
    const unlistenChange = onNoteChangedElsewhere(
      () => void useNotes.getState().onExternalChange(),
    );
    const unlistenNew = onAppEvent(
      "app://new-sticky",
      () => void useNotes.getState().createSticky(),
    );
    // 문서 업데이트 로그 압축은 Hub 창 한 곳에서만 한다
    const compactTimer = window.setInterval(
      () => void useNotes.getState().service?.compactDocs(),
      COMPACT_INTERVAL_MS,
    );
    return () => {
      unlistenChange();
      unlistenNew();
      window.clearInterval(compactTimer);
    };
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        void useNotes.getState().create();
      } else if (key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) {
    return (
      <main className="app-message">
        <p>저장소를 열지 못했습니다.</p>
        <pre>{error}</pre>
      </main>
    );
  }

  if (!ready) return <main className="app-message">불러오는 중…</main>;

  return (
    <main className={`app${hasSelection ? " has-selection" : ""}`}>
      <Sidebar searchRef={searchRef} />
      <EditorPane />
    </main>
  );
}

export default App;
