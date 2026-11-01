import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { tRich } from "../../i18n/rich";
import type { PairingView } from "./pairing";
import { shortDeviceId, useShare } from "./shareStore";
import "./share.css";

/** Friend list + add a friend (same Wi-Fi). While open, Add-a-friend mode (advertising the name) is on. */
export function FriendsDialog() {
  const t = useT();
  const s = useShare();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !s.pairing) void s.closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  if (!s.dialogOpen) return null;

  const contactIds = new Set(s.contacts.map((c) => c.deviceId));
  const nearby = Object.values(s.nearby).filter((p) => !contactIds.has(p.id));

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && void s.closeDialog()}
    >
      <section className="dialog" role="dialog" aria-label={t("친구")} aria-modal>
        <header className="dialog-header">
          <h2>{t("친구")}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => s.closeDialog()}
            aria-label={t("닫기")}
          >
            ×
          </button>
        </header>

        {s.error && <p className="dialog-error">{t(s.error)}</p>}

        <MyDevice />

        <h3 className="dialog-section">{t("친구 목록")}</h3>
        {s.contacts.length === 0 ? (
          <p className="dialog-hint">{t("아직 등록한 친구가 없습니다.")}</p>
        ) : (
          <ul className="peer-list">
            {s.contacts.map((c) => (
              <ContactRow
                key={c.deviceId}
                id={c.deviceId}
                name={c.name}
                online={s.connected.includes(c.deviceId)}
              />
            ))}
          </ul>
        )}

        <h3 className="dialog-section">{t("친구 추가")}</h3>
        <p className="dialog-hint">
          {t(
            "같은 Wi-Fi에 있는 친구도 이 화면을 열면 아래에 나타납니다. 친구를 고르고 두 화면의 확인 코드가 같은지 확인하세요.",
          )}
        </p>
        {nearby.length === 0 ? (
          <p className="dialog-hint searching">{t("근처의 Urinote를 찾는 중…")}</p>
        ) : (
          <ul className="peer-list">
            {nearby.map((p) => (
              <li key={p.id} className="peer-row">
                <span className="peer-name">{p.name}</span>
                <span className="peer-id">{shortDeviceId(p.id)}</span>
                <button
                  type="button"
                  className="text-btn"
                  disabled={!!s.pairing}
                  onClick={() => s.requestPair(p.id, p.name)}
                >
                  {t("친구 요청")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ManualConnect />

        {s.pairing && <PairingPanel view={s.pairing} />}
      </section>
    </div>
  );
}

function MyDevice() {
  const t = useT();
  const { deviceName, myId, setDeviceName } = useShare();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deviceName);

  return (
    <div className="my-device">
      <span className="dialog-hint">{t("내 기기")}</span>
      {editing ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void setDeviceName(draft);
            setEditing(false);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={64}
            autoFocus
          />
          <button type="submit" className="text-btn">
            {t("저장")}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="my-device-name"
          onClick={() => {
            setDraft(deviceName);
            setEditing(true);
          }}
          title={t("이름 바꾸기 (친구에게 보이는 이름)")}
        >
          {deviceName} ✎
        </button>
      )}
      {myId && <span className="peer-id">{shortDeviceId(myId)}</span>}
    </div>
  );
}

function ContactRow({ id, name, online }: { id: string; name: string; online: boolean }) {
  const t = useT();
  const { renameContact, removeContact } = useShare();
  return (
    <li className="peer-row">
      <span
        className={`presence${online ? " online" : ""}`}
        title={online ? t("연결됨") : t("떨어져 있음")}
      />
      <span className="peer-name">{name}</span>
      <span className="peer-id">{shortDeviceId(id)}</span>
      <button
        type="button"
        className="text-btn"
        onClick={() => {
          const next = window.prompt(t("친구 이름"), name);
          if (next) void renameContact(id, next);
        }}
      >
        {t("이름 변경")}
      </button>
      <button
        type="button"
        className="text-btn danger"
        onClick={() => {
          if (window.confirm(t("'{name}'을(를) 친구 목록에서 삭제할까요?", { name }))) {
            void removeContact(id);
          }
        }}
      >
        {t("삭제")}
      </button>
    </li>
  );
}

/** For networks where discovery fails: exchange connection codes via a messenger and connect directly */
function ManualConnect() {
  const t = useT();
  const { myConnectCode, connectWithCode, pairing } = useShare();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        {t("목록에 친구가 안 보이나요? 연결 코드로 연결하기")}
      </button>
    );
  }
  return (
    <div className="manual-connect">
      <button
        type="button"
        className="text-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(await myConnectCode());
          setCopied(true);
        }}
      >
        {copied ? t("복사됨 ✓") : t("내 연결 코드 복사")}
      </button>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void connectWithCode(code);
        }}
      >
        <input
          placeholder={t("친구의 연결 코드 붙여넣기")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="text-btn" disabled={!code || !!pairing}>
          {t("연결")}
        </button>
      </form>
      <p className="dialog-hint">
        {t("같은 Wi-Fi여야 하며, 친구도 이 화면을 열어 두어야 합니다.")}
      </p>
    </div>
  );
}

function PairingPanel({ view }: { view: PairingView }) {
  const t = useT();
  const { acceptPair, confirmPair, cancelPair, dismissPairing } = useShare();
  const peer = <b>{view.peerName}</b>;
  const body = (() => {
    switch (view.phase) {
      case "requesting":
        return (
          <>
            <p>{tRich("{name}에게 친구 요청을 보냈습니다.", { name: peer })}</p>
            <p className="dialog-hint">{t("상대 화면에서 수락하기를 기다리는 중…")}</p>
            <div className="dialog-actions">
              <button type="button" className="text-btn" onClick={cancelPair}>
                {t("취소")}
              </button>
            </div>
          </>
        );
      case "incoming":
        return (
          <>
            <p>{tRich("{name} 님의 친구 요청", { name: peer })}</p>
            <p className="dialog-hint">{t("기기 {id}", { id: shortDeviceId(view.peerId) })}</p>
            <div className="dialog-actions">
              <button type="button" className="text-btn" onClick={cancelPair}>
                {t("거절")}
              </button>
              <button type="button" className="text-btn primary" onClick={acceptPair}>
                {t("수락")}
              </button>
            </div>
          </>
        );
      case "exchanging":
        return <p className="dialog-hint">{t("확인 코드를 만드는 중…")}</p>;
      case "confirm":
        return (
          <>
            <p className="dialog-hint">{t("확인 코드")}</p>
            <p className="pair-code">{view.code}</p>
            <p>{tRich("{name}의 화면에 보이는 코드와 같나요?", { name: peer })}</p>
            <div className="dialog-actions">
              <button type="button" className="text-btn danger" onClick={() => confirmPair(false)}>
                {t("아니요")}
              </button>
              <button type="button" className="text-btn primary" onClick={() => confirmPair(true)}>
                {t("예, 같습니다")}
              </button>
            </div>
          </>
        );
      case "waiting-peer":
        return (
          <>
            <p className="pair-code">{view.code}</p>
            <p className="dialog-hint">{t("상대가 확인하기를 기다리는 중…")}</p>
          </>
        );
      case "done":
        return (
          <>
            <p>✓ {tRich("{name}을(를) 친구로 등록했습니다.", { name: peer })}</p>
            <div className="dialog-actions">
              <button type="button" className="text-btn primary" onClick={dismissPairing}>
                {t("확인")}
              </button>
            </div>
          </>
        );
      case "failed":
        return (
          <>
            <p>{t("친구 등록을 하지 못했습니다.")}</p>
            {/* Reasons sent by the other device are Korean keys too, so they show in my language */}
            <p className="dialog-hint">{view.error && t(view.error)}</p>
            <div className="dialog-actions">
              <button type="button" className="text-btn" onClick={dismissPairing}>
                {t("닫기")}
              </button>
            </div>
          </>
        );
    }
  })();
  return (
    <div className="pairing-overlay">
      <div className="pairing-card" role="alertdialog" aria-live="polite">
        {body}
      </div>
    </div>
  );
}
