import { useState } from "react";
import { useT } from "../../i18n";
import { tRich } from "../../i18n/rich";
import { useNotes } from "../notes/notesStore";
import { MAX_MEMBERS, roleOf, type Member, type ShareRole } from "./membership";
import { shortDeviceId, useShare } from "./shareStore";
import type { Invitee } from "./shareEngine";
import "./share.css";

const ROLE_LABEL: Record<ShareRole, string> = {
  owner: "소유자",
  editor: "편집 가능",
  viewer: "보기 전용",
};

/** Sharing settings for one note: start sharing / manage members (owner) / leave (member) */
export function ShareDialog() {
  const t = useT();
  const noteId = useShare((s) => s.shareDialogNoteId);
  const record = useShare((s) => (noteId ? s.shares[noteId] : undefined));
  const myId = useShare((s) => s.myId);
  const error = useShare((s) => s.error);
  const close = useShare((s) => s.closeShareDialog);
  const title = useNotes((s) => s.notes.find((n) => n.id === noteId)?.title);

  if (!noteId) return null;

  const active = record?.status === "active";
  const m = record?.signed.membership;
  const isOwner = !active || m?.owner === myId;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="dialog" role="dialog" aria-label={t("메모 공유")} aria-modal>
        <header className="dialog-header">
          <h2>{t("'{title}' 공유", { title: title || t("새 메모") })}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={t("닫기")}>
            ×
          </button>
        </header>
        {error && <p className="dialog-error">{t(error)}</p>}
        <p className="dialog-hint">
          {t(
            "같은 Wi-Fi에 있는 친구와 함께 편집합니다. 떨어져 있는 동안의 편집은 다시 만나면 합쳐집니다.",
          )}
        </p>

        {active && m ? (
          <>
            <MemberList noteId={noteId} members={m.members} editable={isOwner} myId={myId} />
            {isOwner && <InvitePicker noteId={noteId} exclude={m.members.map((x) => x.id)} />}
            <ShareFooter noteId={noteId} isOwner={isOwner} myRole={myId ? roleOf(m, myId) : null} />
          </>
        ) : (
          <InvitePicker noteId={noteId} exclude={[]} />
        )}
      </section>
    </div>
  );
}

function MemberList({
  noteId,
  members,
  editable,
  myId,
}: {
  noteId: string;
  members: Member[];
  editable: boolean;
  myId: string | null;
}) {
  const t = useT();
  const connected = useShare((s) => s.connected);
  const setMembers = useShare((s) => s.setMembers);

  return (
    <>
      <h3 className="dialog-section">{t("멤버 {count}명", { count: members.length })}</h3>
      <ul className="peer-list">
        {members.map((member) => {
          const isMe = member.id === myId;
          const online = isMe || connected.includes(member.id);
          return (
            <li key={member.id} className="peer-row">
              <span
                className={`presence${online ? " online" : ""}`}
                title={online ? t("지금 함께 편집 중") : t("떨어져 있음 (만나면 합쳐짐)")}
              />
              <span className="peer-name">
                {member.name}
                {isMe && " (" + t("나") + ")"}
              </span>
              <span className="peer-id">{shortDeviceId(member.id)}</span>
              {editable && member.role !== "owner" ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) =>
                      setMembers(
                        noteId,
                        members.map((x) =>
                          x.id === member.id ? { ...x, role: e.target.value as ShareRole } : x,
                        ),
                      )
                    }
                    aria-label={t("{name} 권한", { name: member.name })}
                  >
                    <option value="editor">{t(ROLE_LABEL.editor)}</option>
                    <option value="viewer">{t(ROLE_LABEL.viewer)}</option>
                  </select>
                  <button
                    type="button"
                    className="text-btn danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "{name}을(를) 공유에서 내보낼까요?\n이미 받아 간 내용은 회수할 수 없습니다.",
                            { name: member.name },
                          ),
                        )
                      ) {
                        void setMembers(
                          noteId,
                          members.filter((x) => x.id !== member.id),
                        );
                      }
                    }}
                  >
                    {t("내보내기")}
                  </button>
                </>
              ) : (
                <span className="dialog-hint">{t(ROLE_LABEL[member.role])}</span>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <p className="dialog-hint">
          {t(
            "권한 변경·내보내기는 그 기기를 다음에 만날 때 적용됩니다. 그 전까지는 이전 권한으로 동기화될 수 있습니다.",
          )}
        </p>
      )}
    </>
  );
}

function InvitePicker({ noteId, exclude }: { noteId: string; exclude: string[] }) {
  const t = useT();
  const contacts = useShare((s) => s.contacts);
  const shareNote = useShare((s) => s.shareNote);
  const openFriends = useShare((s) => s.openDialog);
  const closeShare = useShare((s) => s.closeShareDialog);
  const [picked, setPicked] = useState<Record<string, Invitee["role"]>>({});

  const candidates = contacts.filter((c) => !exclude.includes(c.deviceId));
  const count = Object.keys(picked).length;
  const remaining = MAX_MEMBERS - Math.max(exclude.length, 1);

  if (contacts.length === 0) {
    return (
      <div className="empty-friends">
        <p>{t("공유하려면 먼저 같은 Wi-Fi에 있는 친구를 등록하세요.")}</p>
        <button
          type="button"
          className="text-btn primary"
          onClick={() => {
            closeShare();
            void openFriends();
          }}
        >
          {t("친구 추가")}
        </button>
      </div>
    );
  }
  if (candidates.length === 0) return null;

  return (
    <>
      <h3 className="dialog-section">{exclude.length ? t("친구 초대") : t("함께 편집할 친구")}</h3>
      <ul className="peer-list">
        {candidates.map((c) => {
          const checked = c.deviceId in picked;
          return (
            <li key={c.deviceId} className="peer-row">
              <label className="peer-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && count >= remaining}
                  onChange={(e) =>
                    setPicked((p) => {
                      const next = { ...p };
                      if (e.target.checked) next[c.deviceId] = "editor";
                      else delete next[c.deviceId];
                      return next;
                    })
                  }
                />
                <span className="peer-name">{c.name}</span>
              </label>
              <span className="peer-id">{shortDeviceId(c.deviceId)}</span>
              <select
                value={picked[c.deviceId] ?? "editor"}
                disabled={!checked}
                onChange={(e) =>
                  setPicked((p) => ({ ...p, [c.deviceId]: e.target.value as Invitee["role"] }))
                }
                aria-label={t("{name} 권한", { name: c.name })}
              >
                <option value="editor">{t(ROLE_LABEL.editor)}</option>
                <option value="viewer">{t(ROLE_LABEL.viewer)}</option>
              </select>
            </li>
          );
        })}
      </ul>
      <div className="dialog-actions end">
        <button
          type="button"
          className="text-btn primary"
          disabled={count === 0}
          onClick={async () => {
            const invitees = candidates
              .filter((c) => c.deviceId in picked)
              .map((c) => ({ id: c.deviceId, name: c.name, role: picked[c.deviceId] }));
            await shareNote(noteId, invitees);
            setPicked({});
          }}
        >
          {exclude.length ? t("초대") : t("공유")} ({count})
        </button>
      </div>
      <p className="dialog-hint">
        {t("친구가 같은 Wi-Fi에 없으면 다음에 만날 때 공유 제안이 전달됩니다.")}
      </p>
    </>
  );
}

function ShareFooter({
  noteId,
  isOwner,
  myRole,
}: {
  noteId: string;
  isOwner: boolean;
  myRole: ShareRole | null;
}) {
  const t = useT();
  const { endShare, leaveShare, closeShareDialog } = useShare();
  return (
    <div className="dialog-actions end">
      {!isOwner && myRole && (
        <span className="dialog-hint">{t("내 권한: {role}", { role: t(ROLE_LABEL[myRole]) })}</span>
      )}
      <button
        type="button"
        className="text-btn danger"
        onClick={async () => {
          const message = isOwner
            ? t("공유를 종료할까요?\n친구들의 메모는 각자의 개인 메모로 남습니다.")
            : t("공유에서 나갈까요?\n이 메모는 내 개인 메모로 남고, 이후 변경은 받지 않습니다.");
          if (!window.confirm(message)) return;
          await (isOwner ? endShare(noteId) : leaveShare(noteId));
          closeShareDialog();
        }}
      >
        {isOwner ? t("공유 종료") : t("공유 나가기")}
      </button>
    </div>
  );
}

/** Received share offers (above the hub list) */
export function OfferBanner() {
  const t = useT();
  const inbox = useShare((s) => s.inbox);
  const { acceptOffer, declineOffer } = useShare();
  if (inbox.length === 0) return null;
  return (
    <div className="offer-banner" role="status">
      {inbox.map((offer) => (
        <div key={offer.noteId} className="offer-row">
          <span className="offer-text">
            {tRich("{name}님이 '{title}'을(를) 공유했습니다", {
              name: <b>{offer.fromName}</b>,
              title: offer.title || t("새 메모"),
            })}
          </span>
          <button type="button" className="text-btn" onClick={() => declineOffer(offer.noteId)}>
            {t("거절")}
          </button>
          <button
            type="button"
            className="text-btn primary"
            onClick={() => acceptOffer(offer.noteId)}
          >
            {t("수락")}
          </button>
        </div>
      ))}
    </div>
  );
}
