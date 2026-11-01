import { useState } from "react";
import { ColorPicker } from "../../components/ColorPicker";
import {
  FONT_SIZES,
  LANGUAGES,
  THEMES,
  type FontSize,
  type Language,
  type Theme,
} from "../../domain/settings";
import { useT } from "../../i18n";
import { exportBackup, importBackup } from "./backupActions";
import { useSettings } from "./settingsStore";
import "../share/share.css";
import "./settings.css";

const THEME_LABEL: Record<Theme, string> = {
  system: "시스템 설정",
  light: "밝게",
  dark: "어둡게",
};

const FONT_LABEL: Record<FontSize, string> = {
  small: "작게",
  medium: "보통",
  large: "크게",
  xlarge: "아주 크게",
};

/** 언어 이름은 그 언어로 쓴다 (번역하지 않음) */
const LANGUAGE_LABEL: Record<Language, string> = {
  system: "시스템 설정",
  ko: "한국어",
  en: "English",
};

/** 설정 (E-01). 바꾸는 즉시 저장되고 모든 창에 반영된다 */
export function SettingsDialog() {
  const t = useT();
  const open = useSettings((s) => s.dialogOpen);
  const theme = useSettings((s) => s.theme);
  const defaultColor = useSettings((s) => s.defaultColor);
  const fontSize = useSettings((s) => s.fontSize);
  const language = useSettings((s) => s.language);
  const { update, setDialogOpen } = useSettings.getState();

  if (!open) return null;
  const close = () => setDialogOpen(false);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className="dialog"
        role="dialog"
        aria-label={t("설정")}
        aria-modal
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <header className="dialog-header">
          <h2>{t("설정")}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={t("닫기")}>
            ×
          </button>
        </header>

        <h3 className="dialog-section">{t("언어")}</h3>
        <Segmented
          name="language"
          values={LANGUAGES}
          labels={{ ...LANGUAGE_LABEL, system: t(LANGUAGE_LABEL.system) }}
          value={language}
          onChange={(v) => update({ language: v })}
        />

        <h3 className="dialog-section">{t("테마")}</h3>
        <Segmented
          name="theme"
          values={THEMES}
          labels={translate(THEME_LABEL)}
          value={theme}
          onChange={(v) => update({ theme: v })}
        />

        <h3 className="dialog-section">{t("메모 글자 크기")}</h3>
        <Segmented
          name="font-size"
          values={FONT_SIZES}
          labels={translate(FONT_LABEL)}
          value={fontSize}
          onChange={(v) => update({ fontSize: v })}
        />

        <h3 className="dialog-section">{t("새 메모 색상")}</h3>
        <ColorPicker value={defaultColor} onChange={(c) => update({ defaultColor: c })} />
        <p className="dialog-hint">{t("스티키 창의 +는 그 메모와 같은 색으로 만듭니다.")}</p>

        <BackupSection />
      </section>
    </div>
  );

  function translate<K extends string>(labels: Record<K, string>) {
    return Object.fromEntries(
      Object.entries(labels).map(([k, v]) => [k, t(v as string)]),
    ) as Record<K, string>;
  }
}

/** JSON 내보내기·가져오기 (E-02) */
function BackupSection() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ text });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 className="dialog-section">{t("백업")}</h3>
      <div className="backup-actions">
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const count = await exportBackup();
              return count === null ? null : t("메모 {count}개를 저장했습니다.", { count });
            })
          }
        >
          {t("JSON으로 내보내기")}
        </button>
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await importBackup(({ notes, folders }) =>
                window.confirm(
                  t(
                    "메모 {notes}개, 폴더 {folders}개를 가져옵니다.\n지금 있는 메모는 지워지지 않고, 같은 메모는 내용이 합쳐집니다.\n설정은 파일의 설정으로 바뀝니다.",
                    { notes, folders },
                  ),
                ),
              );
              return result === null
                ? null
                : t("새 메모 {created}개, 합친 메모 {merged}개를 가져왔습니다.", {
                    created: result.created,
                    merged: result.merged,
                  });
            })
          }
        >
          {t("가져오기")}
        </button>
      </div>
      {message && (
        <p className={message.error ? "dialog-error" : "dialog-hint"} role="status">
          {message.text}
        </p>
      )}
      <p className="dialog-hint">
        {t(
          "메모·폴더·설정을 담습니다. 친구 목록과 공유 정보는 담지 않으며, 공유 메모는 개인 메모로 들어옵니다.",
        )}
      </p>
    </>
  );
}

function Segmented<T extends string>({
  name,
  values,
  labels,
  value,
  onChange,
}: {
  name: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {values.map((v) => (
        <label key={v} className={`segment${v === value ? " active" : ""}`}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={v === value}
            onChange={() => onChange(v)}
          />
          {labels[v]}
        </label>
      ))}
    </div>
  );
}
