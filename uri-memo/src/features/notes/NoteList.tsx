import { previewFromText } from "../../domain/note";
import { formatReminder } from "../../domain/reminder";
import { useT } from "../../i18n";
import { isDesktopApp } from "../../platform/env";
import { openSticky } from "../../platform/stickyWindows";
import { formatNoteTime } from "./formatTime";
import { useNotes } from "./notesStore";

export function NoteList() {
  const t = useT();
  const notes = useNotes((s) => s.notes);
  const view = useNotes((s) => s.view);
  const query = useNotes((s) => s.query);
  const selectedId = useNotes((s) => s.selectedId);
  const select = useNotes((s) => s.select);
  const folders = useNotes((s) => s.folders);
  const folderId = useNotes((s) => s.folderId);
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));

  if (notes.length === 0) {
    const message = query
      ? t('"{query}"에 대한 검색 결과가 없습니다.', { query })
      : view === "trash"
        ? t("휴지통이 비어 있습니다.")
        : view === "pinned"
          ? t("고정한 메모가 없습니다.")
          : folderId
            ? t("이 폴더에 메모가 없습니다.\n+ 버튼을 누르면 이 폴더에 만듭니다.")
            : t("메모가 없습니다.\n+ 버튼으로 새 메모를 만드세요.");
    return <p className="note-list-empty">{message}</p>;
  }

  return (
    <ul className="note-list" aria-label={t("메모 목록")}>
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            className={`note-card color-${note.color}${note.id === selectedId ? " selected" : ""}`}
            onClick={() => select(note.id)}
            onDoubleClick={() => isDesktopApp && view !== "trash" && void openSticky(note.id)}
            title={isDesktopApp && view !== "trash" ? t("더블클릭: 바탕화면에 붙이기") : undefined}
            aria-current={note.id === selectedId}
          >
            <span className="note-card-head">
              <span className="note-card-title">{note.title || t("새 메모")}</span>
              {note.spaceId && (
                <span
                  className="note-card-pin"
                  aria-label={t("친구와 공유 중")}
                  title={t("친구와 공유 중")}
                >
                  👥
                </span>
              )}
              {note.pinned && (
                <span className="note-card-pin" aria-label={t("고정됨")}>
                  📌
                </span>
              )}
            </span>
            <span className="note-card-preview">{previewFromText(note.plainText)}</span>
            <span className="note-card-time">
              {formatNoteTime(
                view === "trash" ? (note.deletedAt ?? note.updatedAt) : note.updatedAt,
              )}
              {note.remindAt !== null && view !== "trash" && (
                <span className="note-card-reminder"> · ⏰ {formatReminder(note.remindAt)}</span>
              )}
              {folderId === null && note.folderId && folderNames.get(note.folderId) && (
                <span className="note-card-folder"> · {folderNames.get(note.folderId)}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
