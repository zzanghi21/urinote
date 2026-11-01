import { useState } from "react";
import {
  formatReminder,
  fromLocalInput,
  reminderPresets,
  toLocalInput,
} from "../../domain/reminder";
import "./reminders.css";

interface Props {
  value: number | null;
  onChange(remindAt: number | null): void;
}

/** 편집기 머리글의 ⏰ 버튼 + 알림 시각 고르기 */
export function ReminderButton({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="reminder-wrap">
      <button
        type="button"
        className={`icon-btn${value ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={value ? `알림: ${formatReminder(value)}` : "알림 설정"}
        title={value ? `알림: ${formatReminder(value)}` : "알림 설정"}
      >
        ⏰
      </button>
      {open && (
        <div className="reminder-popover" role="dialog" aria-label="알림 설정">
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
  const [now] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => toLocalInput(value ?? now + 60 * 60 * 1000));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const at = fromLocalInput(draft);
    if (at === null) return setError("날짜와 시각을 입력하세요");
    if (at <= Date.now()) return setError("지난 시각입니다");
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
          aria-label="알림 날짜와 시각"
        />
        <button type="button" className="text-btn primary" onClick={submit}>
          설정
        </button>
      </div>
      {error && <p className="reminder-error">{error}</p>}
      {value && (
        <button type="button" className="text-btn danger" onClick={() => onChange(null)}>
          알림 해제
        </button>
      )}
    </div>
  );
}
