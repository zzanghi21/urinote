import { formatReminder } from "../../domain/reminder";
import { useReminders } from "./remindersStore";
import "./reminders.css";

/** 앱이 꺼져 있던 동안 지난 알림 (시작할 때 한 번) */
export function MissedBanner() {
  const missed = useReminders((s) => s.missed);
  const { openMissed, dismissMissed } = useReminders.getState();
  if (missed.length === 0) return null;
  return (
    <div className="missed-banner" role="status">
      {missed.map((m) => (
        <div key={m.id} className="missed-row">
          <span className="missed-text">
            ⏰ 놓친 알림: <b>{m.title || "새 메모"}</b> ({formatReminder(m.at)})
          </span>
          <button type="button" className="text-btn" onClick={() => dismissMissed(m.id)}>
            닫기
          </button>
          <button type="button" className="text-btn primary" onClick={() => openMissed(m.id)}>
            열기
          </button>
        </div>
      ))}
    </div>
  );
}
