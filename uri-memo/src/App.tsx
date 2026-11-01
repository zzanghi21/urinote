import { useEffect, useRef, useState } from "react";
import { openStores } from "./data";
import { FolderService } from "./domain/folderService";
import { NoteService } from "./domain/noteService";
import { EditorPane } from "./features/notes/EditorPane";
import { useNotes } from "./features/notes/notesStore";
import { Sidebar } from "./features/notes/Sidebar";
import { useReminders } from "./features/reminders/remindersStore";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { FriendsDialog } from "./features/share/FriendsDialog";
import { ShareDialog } from "./features/share/ShareDialog";
import { useShare } from "./features/share/shareStore";
import { isDesktopApp } from "./platform/env";
import { onAppEvent, onNoteChangedElsewhere } from "./platform/events";
import { restoreOpenStickies } from "./platform/stickyWindows";
import { updateTrayLabels } from "./platform/tray";
import { useLocale, useT } from "./i18n";
import "./App.css";

/** App.css 의 2단 레이아웃 기준과 같아야 한다 */
const TWO_PANE_QUERY = "(min-width: 720px)";
const COMPACT_INTERVAL_MS = 5 * 60 * 1000;

function App() {
  const t = useT();
  const ready = useNotes((s) => s.ready);
  const hasSelection = useNotes((s) => s.selectedId !== null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openStores()
      .then(({ notes, docs, folders }) => {
        const service = new NoteService(notes, docs);
        return useNotes
          .getState()
          .init(
            service,
            new FolderService(folders, service),
            window.matchMedia(TWO_PANE_QUERY).matches,
          )
          .then(() => useReminders.getState().init(service));
      })
      .then(() => (isDesktopApp ? restoreOpenStickies() : undefined))
      .catch((e: unknown) => setError(String(e)));
    void useShare.getState().init();
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

  // 트레이 메뉴도 앱 언어를 따른다
  const locale = useLocale();
  useEffect(() => {
    void updateTrayLabels().catch(console.error);
  }, [locale]);

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
        <p>{t("저장소를 열지 못했습니다.")}</p>
        <pre>{error}</pre>
      </main>
    );
  }

  if (!ready) return <main className="app-message">{t("불러오는 중…")}</main>;

  return (
    <main className={`app${hasSelection ? " has-selection" : ""}`}>
      <Sidebar searchRef={searchRef} />
      <EditorPane />
      <FriendsDialog />
      <ShareDialog />
      <SettingsDialog />
    </main>
  );
}

export default App;
