import type { NoteView } from "../../domain/note";
import { NoteList } from "./NoteList";
import { useNotes } from "./notesStore";

const VIEWS: { view: NoteView; label: string }[] = [
  { view: "all", label: "전체" },
  { view: "pinned", label: "고정" },
  { view: "trash", label: "휴지통" },
];

export function Sidebar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const view = useNotes((s) => s.view);
  const query = useNotes((s) => s.query);
  const { setView, setQuery, create } = useNotes.getState();

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1 className="brand">Urinote</h1>
        <button
          type="button"
          className="new-btn"
          onClick={() => create()}
          title="새 메모 (Ctrl+N)"
          aria-label="새 메모"
        >
          +
        </button>
      </header>

      <input
        ref={searchRef}
        className="search"
        type="search"
        placeholder="메모 검색 (Ctrl+F)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="메모 검색"
      />

      <nav className="view-tabs" aria-label="보기">
        {VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            className={`view-tab${view === v.view ? " active" : ""}`}
            aria-current={view === v.view}
            onClick={() => setView(v.view)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <NoteList />
    </aside>
  );
}
