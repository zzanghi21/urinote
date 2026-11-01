import { ColorPicker } from "../../components/ColorPicker";
import { FONT_SIZES, THEMES, type FontSize, type Theme } from "../../domain/settings";
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

/** 설정 (E-01). 바꾸는 즉시 저장되고 모든 창에 반영된다 */
export function SettingsDialog() {
  const open = useSettings((s) => s.dialogOpen);
  const theme = useSettings((s) => s.theme);
  const defaultColor = useSettings((s) => s.defaultColor);
  const fontSize = useSettings((s) => s.fontSize);
  const { update, setDialogOpen } = useSettings.getState();

  if (!open) return null;
  const close = () => setDialogOpen(false);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className="dialog"
        role="dialog"
        aria-label="설정"
        aria-modal
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <header className="dialog-header">
          <h2>설정</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="닫기">
            ×
          </button>
        </header>

        <h3 className="dialog-section">테마</h3>
        <Segmented
          name="theme"
          values={THEMES}
          labels={THEME_LABEL}
          value={theme}
          onChange={(v) => update({ theme: v })}
        />

        <h3 className="dialog-section">메모 글자 크기</h3>
        <Segmented
          name="font-size"
          values={FONT_SIZES}
          labels={FONT_LABEL}
          value={fontSize}
          onChange={(v) => update({ fontSize: v })}
        />

        <h3 className="dialog-section">새 메모 색상</h3>
        <ColorPicker value={defaultColor} onChange={(c) => update({ defaultColor: c })} />
        <p className="dialog-hint">스티키 창의 +는 그 메모와 같은 색으로 만듭니다.</p>
      </section>
    </div>
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
