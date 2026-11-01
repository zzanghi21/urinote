import { useState } from "react";
import { FOLDER_NAME_MAX } from "../../domain/folder";
import { useT } from "../../i18n";
import { useNotes } from "./notesStore";

type Editing = { mode: "create" } | { mode: "rename"; id: string } | null;

/** Pick, create, rename and delete folders above the list (hidden in the trash view) */
export function FolderBar() {
  const t = useT();
  const folders = useNotes((s) => s.folders);
  const folderId = useNotes((s) => s.folderId);
  const view = useNotes((s) => s.view);
  const { setFolder, createFolder, renameFolder, deleteFolder } = useNotes.getState();
  const [editing, setEditing] = useState<Editing>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (view === "trash") return null;
  const active = folders.find((f) => f.id === folderId);

  if (editing) {
    const initial = editing.mode === "rename" ? (active?.name ?? "") : "";
    return (
      <form
        className="folder-bar folder-form"
        onSubmit={(e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get("name") as string;
          void (
            editing.mode === "create" ? createFolder(name) : renameFolder(editing.id, name)
          ).then(() => setEditing(null));
        }}
      >
        <input
          name="name"
          defaultValue={initial}
          maxLength={FOLDER_NAME_MAX}
          placeholder={t("폴더 이름")}
          aria-label={t("폴더 이름")}
          autoFocus
          onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
        />
        <button type="submit" className="text-btn primary">
          {editing.mode === "create" ? t("만들기") : t("저장")}
        </button>
        <button type="button" className="text-btn" onClick={() => setEditing(null)}>
          {t("취소")}
        </button>
      </form>
    );
  }

  return (
    <nav className="folder-bar" aria-label={t("폴더")}>
      <button
        type="button"
        className={`folder-chip${folderId === null ? " active" : ""}`}
        aria-current={folderId === null}
        onClick={() => void setFolder(null)}
      >
        {t("모든 폴더")}
      </button>
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`folder-chip${f.id === folderId ? " active" : ""}`}
          aria-current={f.id === folderId}
          onClick={() => {
            setMenuOpen(false);
            void setFolder(f.id);
          }}
        >
          {f.name}
        </button>
      ))}
      {active && (
        <span className="folder-menu-wrap">
          <button
            type="button"
            className="folder-chip"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={t("'{name}' 폴더 관리", { name: active.name })}
            title={t("폴더 관리")}
          >
            ⋯
          </button>
          {menuOpen && (
            <span className="folder-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing({ mode: "rename", id: active.id });
                }}
              >
                {t("이름 바꾸기")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  if (
                    window.confirm(
                      t(
                        "'{name}' 폴더를 삭제할까요?\n안의 메모는 지워지지 않고 \"폴더 없음\"으로 옮겨집니다.",
                        { name: active.name },
                      ),
                    )
                  ) {
                    void deleteFolder(active.id);
                  }
                }}
              >
                {t("폴더 삭제")}
              </button>
            </span>
          )}
        </span>
      )}
      <button
        type="button"
        className="folder-chip add"
        onClick={() => setEditing({ mode: "create" })}
        title={t("새 폴더")}
        aria-label={t("새 폴더")}
      >
        {t("+ 폴더")}
      </button>
    </nav>
  );
}
