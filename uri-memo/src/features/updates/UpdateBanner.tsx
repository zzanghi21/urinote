import { useT } from "../../i18n";
import { useUpdate } from "./updateStore";

/** 새 버전 알림 (Hub 목록 위) */
export function UpdateBanner() {
  const t = useT();
  const status = useUpdate((s) => s.status);
  const version = useUpdate((s) => s.version);
  const progress = useUpdate((s) => s.progress);
  const error = useUpdate((s) => s.error);
  const { install, dismiss } = useUpdate.getState();

  if (status === "idle") return null;
  return (
    <div className="update-banner" role="status">
      {status === "available" && (
        <>
          <span className="update-text">
            {t("새 버전 {version}이 있습니다", { version: version ?? "" })}
          </span>
          <button type="button" className="text-btn" onClick={dismiss}>
            {t("나중에")}
          </button>
          <button type="button" className="text-btn primary" onClick={() => void install()}>
            {t("설치하고 다시 시작")}
          </button>
        </>
      )}
      {status === "installing" && (
        <span className="update-text">
          {progress === null
            ? t("업데이트를 내려받는 중…")
            : t("업데이트를 내려받는 중… {percent}%", { percent: progress })}
        </span>
      )}
      {status === "error" && (
        <>
          <span className="update-text">
            {t("업데이트하지 못했습니다: {error}", { error: error ?? "" })}
          </span>
          <button type="button" className="text-btn" onClick={dismiss}>
            {t("닫기")}
          </button>
        </>
      )}
    </div>
  );
}
