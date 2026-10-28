import { useEffect, useRef, useState } from "react";
import { openNoteRepository } from "./data";
import { NoteService } from "./domain/noteService";
import { EditorPane } from "./features/notes/EditorPane";
import { useNotes } from "./features/notes/notesStore";
import { Sidebar } from "./features/notes/Sidebar";
import "./App.css";

/** App.css 의 2단 레이아웃 기준과 같아야 한다 */
const TWO_PANE_QUERY = "(min-width: 720px)";

function App() {
  const ready = useNotes((s) => s.ready);
  const hasSelection = useNotes((s) => s.selectedId !== null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openNoteRepository()
      .then((repo) =>
        useNotes.getState().init(new NoteService(repo), window.matchMedia(TWO_PANE_QUERY).matches),
      )
      .catch((e: unknown) => setError(String(e)));
  }, []);

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
