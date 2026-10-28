import { ColorPicker } from "../../components/ColorPicker";
import { isDesktopApp } from "../../platform/env";
import { openSticky } from "../../platform/stickyWindows";
import { formatNoteTime } from "./formatTime";
import { NoteEditor } from "./NoteEditor";
import { useNotes, useSelectedNote } from "./notesStore";

export function EditorPane() {
  const note = useSelectedNote();
  const { select, edit, trash, restore, deleteForever } = useNotes.getState();

  if (!note) {
    return (
      <section className="editor-pane empty">
        <p>메모를 선택하거나 새로 만드세요.</p>
      </section>
    );
  }

  const inTrash = note.deletedAt !== null;

  return (
    <section className={`editor-pane color-${note.color}`} aria-label="메모 편집">
      <header className="editor-header">
        <button
          type="button"
          className="icon-btn back-btn"
          onClick={() => select(null)}
          aria-label="목록으로"
        >
          ‹
        </button>

        {inTrash ? (
          <div className="editor-actions">
            <span className="editor-meta">휴지통의 메모는 30일 후 영구 삭제됩니다.</span>
            <button type="button" className="text-btn" onClick={() => restore(note.id)}>
              복원
            </button>
            <button
              type="button"
              className="text-btn danger"
              onClick={() => {
                if (window.confirm("이 메모를 영구 삭제할까요? 되돌릴 수 없습니다.")) {
                  void deleteForever(note.id);
                }
              }}
            >
              영구 삭제
            </button>
          </div>
        ) : (
          <div className="editor-actions">
            <span className="editor-meta">{formatNoteTime(note.updatedAt)} 수정</span>
            <ColorPicker value={note.color} onChange={(color) => edit(note.id, { color })} />
            {isDesktopApp && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => openSticky(note.id)}
                aria-label="바탕화면에 붙이기"
                title="바탕화면에 붙이기"
              >
                ⧉
              </button>
            )}
            <button
              type="button"
              className={`icon-btn${note.pinned ? " active" : ""}`}
              onClick={() => edit(note.id, { pinned: !note.pinned })}
              aria-pressed={note.pinned}
              aria-label={note.pinned ? "고정 해제" : "고정"}
              title={note.pinned ? "고정 해제" : "고정"}
            >
              📌
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => trash(note.id)}
              aria-label="휴지통으로 이동"
              title="휴지통으로 이동"
            >
              🗑
            </button>
          </div>
        )}
      </header>

      <NoteEditor
        key={note.id}
        noteId={note.id}
        readOnly={inTrash}
        onSave={(changes) => edit(note.id, changes)}
      />
    </section>
  );
}
