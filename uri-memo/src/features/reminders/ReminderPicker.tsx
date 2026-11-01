import { useEffect, useRef, useState } from "react";
import {
  formatReminder,
  fromLocalInput,
  reminderPresets,
  toLocalInput,
} from "../../domain/reminder";
import { useT } from "../../i18n";
import "./reminders.css";

interface Props {
  value: number | null;
  onChange(remindAt: number | null): void;
}

/** 편집기 머리글의 ⏰ 버튼 + 알림 시각 고르기 */
export function ReminderButton({ value, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const label = value ? t("알림: {time}", { time: formatReminder(value) }) : t("알림 설정");

  // 바깥을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="reminder-wrap" ref={wrap}>
      <button
        type="button"
        className={`icon-btn${value ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        ⏰
      </button>
      {open && (
        <div className="reminder-popover" role="dialog" aria-label={t("알림 설정")}>
          <ReminderFields
            value={value}
            onChange={(at) => {
              onChange(at);
              setOpen(false);
            }}
          />
        </div>
      )}
    </span>
  );
}

/** 빠른 선택 + 날짜·시각 직접 입력 + 해제. 스티키 메뉴에서는 이것만 쓴다 */
export function ReminderFields({ value, onChange }: Props) {
  const t = useT();
  const [now] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => toLocalInput(value ?? now + 60 * 60 * 1000));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const at = fromLocalInput(draft);
    if (at === null) return setError(t("날짜와 시각을 입력하세요"));
    if (at <= Date.now()) return setError(t("지난 시각입니다"));
    onChange(at);
  };

  return (
    <div className="reminder-fields">
      {value && <p className="reminder-current">⏰ {formatReminder(value)}</p>}
      <div className="reminder-presets">
        {reminderPresets(now).map((p) => (
          <button key={p.label} type="button" className="text-btn" onClick={() => onChange(p.at)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="reminder-custom">
        <input
          type="datetime-local"
          value={draft}
          min={toLocalInput(now)}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label={t("알림 날짜와 시각")}
        />
        <button type="button" className="text-btn primary" onClick={submit}>
          {t("설정@set")}
        </button>
      </div>
      {error && <p className="reminder-error">{error}</p>}
      {value && (
        <button type="button" className="text-btn danger" onClick={() => onChange(null)}>
          {t("알림 해제")}
        </button>
      )}
    </div>
  );
}
