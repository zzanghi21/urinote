import { formatReminder } from "../../domain/reminder";
import { useReminders } from "./remindersStore";
import { useT } from "../../i18n";
import "./reminders.css";

/** 앱이 꺼져 있던 동안 지난 알림 (시작할 때 한 번) */
export function MissedBanner() {
  const t = useT();
  const missed = useReminders((s) => s.missed);
  const { openMissed, dismissMissed } = useReminders.getState();
  if (missed.length === 0) return null;
  return (
    <div className="missed-banner" role="status">
      {missed.map((m) => (
        <div key={m.id} className="missed-row">
          <span className="missed-text">
            ⏰ {t("놓친 알림")}: <b>{m.title || t("새 메모")}</b> ({formatReminder(m.at)})
          </span>
          <button type="button" className="text-btn" onClick={() => dismissMissed(m.id)}>
            {t("닫기")}
          </button>
          <button type="button" className="text-btn primary" onClick={() => openMissed(m.id)}>
            {t("열기")}
          </button>
        </div>
      ))}
    </div>
  );
}
