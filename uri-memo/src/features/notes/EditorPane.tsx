import { ColorPicker } from "../../components/ColorPicker";
import { useT } from "../../i18n";
import { isDesktopApp } from "../../platform/env";
import { openSticky } from "../../platform/stickyWindows";
import { ReminderButton } from "../reminders/ReminderPicker";
import { roleOf, type Member } from "../share/membership";
import { presenceColor } from "../share/presence";
import { useShare } from "../share/shareStore";
import { formatNoteTime } from "./formatTime";
import { NoteEditor } from "./NoteEditor";
import { useNotes, useSelectedNote } from "./notesStore";

export function EditorPane() {
  const t = useT();
  const note = useSelectedNote();
  const folders = useNotes((s) => s.folders);
  const { select, edit, trash, restore, deleteForever } = useNotes.getState();
  const shareAvailable = useShare((s) => s.available);
  const share = useShare((s) => (note ? s.shares[note.id] : undefined));
  const myId = useShare((s) => s.myId);
  const connected = useShare((s) => s.connected);
  const { openShareDialog, beforeDeleteForever, forgetShare } = useShare.getState();

  if (!note) {
    return (
      <section className="editor-pane empty">
        <p>{t("메모를 선택하거나 새로 만드세요.")}</p>
      </section>
    );
  }

  const inTrash = note.deletedAt !== null;
  const activeShare = share?.status === "active" ? share.signed.membership : null;
  const myRole = activeShare && myId ? roleOf(activeShare, myId) : null;
  const viewOnly = myRole === "viewer";
  const online = activeShare
    ? activeShare.members.filter((m) => m.id !== myId && connected.includes(m.id))
    : [];
  const shared = activeShare !== null && myRole !== null;

  return (
    <section className={`editor-pane color-${note.color}`} aria-label={t("메모 편집")}>
      <header className="editor-header">
        <button
          type="button"
          className="icon-btn back-btn"
          onClick={() => select(null)}
          aria-label={t("목록으로")}
        >
          ‹
        </button>

        {inTrash ? (
          <div className="editor-actions">
            <span className="editor-meta">
              {activeShare
                ? t("공유 메모입니다. 영구 삭제하면 공유에서 나갑니다 (소유자는 공유 종료).")
                : t("휴지통의 메모는 30일 후 영구 삭제됩니다.")}
            </span>
            <button type="button" className="text-btn" onClick={() => restore(note.id)}>
              {t("복원")}
            </button>
            <button
              type="button"
              className="text-btn danger"
              onClick={async () => {
                if (!window.confirm(t("이 메모를 영구 삭제할까요? 되돌릴 수 없습니다."))) return;
                if (activeShare) await beforeDeleteForever(note.id);
                await deleteForever(note.id);
              }}
            >
              {t("영구 삭제")}
            </button>
          </div>
        ) : (
          <div className="editor-actions">
            <span className="editor-meta">
              {viewOnly ? t("보기 전용") + " · " : ""}
              {t("{time} 수정", { time: formatNoteTime(note.updatedAt) })}
            </span>
            <ColorPicker value={note.color} onChange={(color) => edit(note.id, { color })} />
            {folders.length > 0 && (
              <select
                className="folder-select"
                value={note.folderId ?? ""}
                onChange={(e) => useNotes.getState().moveToFolder(note.id, e.target.value || null)}
                aria-label={t("폴더")}
                title={t("폴더")}
              >
                <option value="">{t("폴더 없음")}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {shared && <PresenceAvatars members={online} />}
            <ReminderButton
              value={note.remindAt}
              onChange={(at) => useNotes.getState().setReminder(note.id, at)}
            />
            {shareAvailable && (
              <button
                type="button"
                className={`icon-btn${activeShare ? " active" : ""}`}
                onClick={() => openShareDialog(note.id)}
                aria-label={t("친구와 공유")}
                title={
                  activeShare
                    ? t("공유 중 · {count}명 (지금 연결 {online}명)", {
                        count: activeShare.members.length,
                        online: online.length,
                      })
                    : t("친구와 공유 (같은 Wi-Fi)")
                }
              >
                👥
                {activeShare && <span className="shared-badge">{activeShare.members.length}</span>}
              </button>
            )}
            {isDesktopApp && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => openSticky(note.id)}
                aria-label={t("바탕화면에 붙이기")}
                title={t("바탕화면에 붙이기")}
              >
                ⧉
              </button>
            )}
            <button
              type="button"
              className={`icon-btn${note.pinned ? " active" : ""}`}
              onClick={() => edit(note.id, { pinned: !note.pinned })}
              aria-pressed={note.pinned}
              aria-label={note.pinned ? t("고정 해제") : t("고정")}
              title={note.pinned ? t("고정 해제") : t("고정")}
            >
              📌
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => trash(note.id)}
              aria-label={t("휴지통으로 이동")}
              title={activeShare ? t("휴지통으로 이동 (나에게서만 숨김)") : t("휴지통으로 이동")}
            >
              🗑
            </button>
          </div>
        )}
      </header>

      {/* 소유자는 이 기록으로 아직 못 만난 멤버에게 종료를 전하므로 지우지 않는다 */}
      {share && share.status !== "active" && share.signed.membership.owner !== myId && (
        <div className="share-notice" role="status">
          <span>
            {share.status === "ended"
              ? t("소유자가 공유를 종료했습니다. 이 메모는 내 개인 메모로 남았습니다.")
              : t("공유에서 빠졌습니다. 이 메모는 내 개인 메모로 남았습니다.")}
          </span>
          <button type="button" className="text-btn" onClick={() => forgetShare(note.id)}>
            {t("확인")}
          </button>
        </div>
      )}

      <NoteEditor
        key={`${note.id}:${viewOnly}`}
        noteId={note.id}
        readOnly={inTrash || viewOnly}
        shared={shared && !inTrash}
        onSave={(changes) => edit(note.id, changes)}
      />
    </section>
  );
}

/** 지금 연결되어 함께 보고 있을 수 있는 멤버 (커서 색과 같은 색) */
function PresenceAvatars({ members }: { members: Member[] }) {
  const t = useT();
  const contacts = useShare((s) => s.contacts);
  if (members.length === 0) {
    return (
      <span
        className="presence-none"
        title={t("연결된 멤버가 없습니다. 다시 만나면 편집이 합쳐집니다")}
      >
        {t("혼자 편집 중")}
      </span>
    );
  }
  return (
    <span
      className="presence-avatars"
      aria-label={t("지금 연결된 멤버 {count}명", { count: members.length })}
    >
      {members.map((m) => {
        const name = contacts.find((c) => c.deviceId === m.id)?.name ?? m.name;
        return (
          <span
            key={m.id}
            className="presence-avatar"
            style={{ backgroundColor: presenceColor(m.id) }}
            title={t("{name} · 연결됨", { name })}
          >
            {[...name][0] ?? "?"}
          </span>
        );
      })}
    </span>
  );
}
