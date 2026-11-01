import type { NoteView } from "../../domain/note";
import { useT } from "../../i18n";
import { appKey } from "../../platform/shortcuts";
import { OfferBanner } from "../share/ShareDialog";
import { MissedBanner } from "../reminders/MissedBanner";
import { useSettings } from "../settings/settingsStore";
import { useShare } from "../share/shareStore";
import { FolderBar } from "./FolderBar";
import { NoteList } from "./NoteList";
import { useNotes } from "./notesStore";

const VIEWS: { view: NoteView; label: string }[] = [
  { view: "all", label: "전체" },
  { view: "pinned", label: "고정@tab" },
  { view: "trash", label: "휴지통" },
];

export function Sidebar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const t = useT();
  const view = useNotes((s) => s.view);
  const query = useNotes((s) => s.query);
  const { setView, setQuery, create } = useNotes.getState();
  const shareAvailable = useShare((s) => s.available);
  const friendCount = useShare((s) => s.contacts.length);
  const onlineCount = useShare(
    (s) => s.connected.filter((id) => s.contacts.some((c) => c.deviceId === id)).length,
  );
  const shareError = useShare((s) => s.error);
  const status =
    friendCount === 0
      ? t("친구 (같은 Wi-Fi 공유)")
      : onlineCount > 0
        ? t("친구 {count}명 중 {online}명 연결됨", { count: friendCount, online: onlineCount })
        : t("친구 {count}명 · 지금 같은 Wi-Fi 에 없음", { count: friendCount });

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1 className="brand">Urinote</h1>
        {shareAvailable && (
          <button
            type="button"
            className="icon-btn friends-btn"
            onClick={() => useShare.getState().openDialog()}
            title={
              shareError ? status + "\n" + t("오류: {message}", { message: t(shareError) }) : status
            }
            aria-label={status}
          >
            👥
            {friendCount > 0 && (
              <span
                className={`conn-dot${onlineCount > 0 ? " online" : ""}${shareError ? " error" : ""}`}
              />
            )}
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => useSettings.getState().setDialogOpen(true)}
          title={t("설정")}
          aria-label={t("설정")}
        >
          ⚙
        </button>
        <button
          type="button"
          className="new-btn"
          onClick={() => create()}
          title={t("새 메모 ({key})", { key: appKey("N") })}
          aria-label={t("새 메모")}
        >
          +
        </button>
      </header>

      <input
        ref={searchRef}
        className="search"
        type="search"
        placeholder={t("메모 검색 ({key})", { key: appKey("F") })}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t("메모 검색")}
      />

      <MissedBanner />
      <OfferBanner />

      <nav className="view-tabs" aria-label={t("보기")}>
        {VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            className={`view-tab${view === v.view ? " active" : ""}`}
            aria-current={view === v.view}
            onClick={() => setView(v.view)}
          >
            {t(v.label)}
          </button>
        ))}
      </nav>
      <FolderBar />

      <NoteList />
    </aside>
  );
}
