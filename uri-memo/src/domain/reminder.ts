import { currentLocale, t } from "../i18n";
import type { Note } from "./note";

/** Reminder (N-01) time helpers. Times are Unix milliseconds, displayed in the device time zone */

const HOUR = 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const ms = new Date(y, mo - 1, d, h, mi).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function at(base: number, dayOffset: number, hour: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export interface ReminderPreset {
  label: string;
  at: number;
}

/** Presets: in 1 hour, this evening (omitted if past), tomorrow morning, next Monday morning */
export function reminderPresets(now: number): ReminderPreset[] {
  const presets: ReminderPreset[] = [{ label: t("1시간 뒤"), at: now + HOUR }];
  const evening = at(now, 0, 18);
  if (evening - now > HOUR) presets.push({ label: t("오늘 저녁 6시"), at: evening });
  presets.push({ label: t("내일 오전 9시"), at: at(now, 1, 9) });
  const day = new Date(now).getDay();
  const toMonday = (8 - day) % 7 || 7;
  presets.push({ label: t("다음 주 월요일 오전 9시"), at: at(now, toMonday, 9) });
  return presets;
}

/** List/header display: "Today 18:00", "Tomorrow 09:00", "Mon, Nov 2 09:00", with the year if different */
export function formatReminder(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (x: number) => at(x, 0, 0);
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / (24 * HOUR));
  if (days === 0) return t("오늘 {time}", { time });
  if (days === 1) return t("내일 {time}", { time });
  if (days === -1) return t("어제 {time}", { time });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const locale = currentLocale() === "ko" ? "ko-KR" : "en-US";
  const vars = {
    year: d.getFullYear(),
    month: new Intl.DateTimeFormat(locale, { month: "short" }).format(d),
    day: d.getDate(),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d),
    time,
  };
  // Korean: "11월 2일 (월) 09:00", English: "Mon, Nov 2 09:00"
  return sameYear
    ? t("{month} {day}일 ({weekday}) {time}", vars)
    : t("{year}년 {month} {day}일 ({weekday}) {time}", vars);
}

/** Reminders of notes outside the trash: past (missed) and upcoming */
export function splitReminders(notes: Note[], now: number) {
  const active = notes.filter((n) => n.remindAt !== null && n.deletedAt === null);
  return {
    missed: active.filter((n) => n.remindAt! <= now),
    upcoming: active.filter((n) => n.remindAt! > now),
  };
}
