import type { Note } from "./note";

/** 메모 알림 (N-01) 시각 계산. 시각은 Unix 밀리초, 화면 표시는 기기 시간대 */

const HOUR = 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** <input type="datetime-local"> 값 (YYYY-MM-DDTHH:mm) */
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

/** 빠른 선택: 1시간 뒤, 오늘 저녁(지났으면 빠짐), 내일 아침, 다음 주 월요일 아침 */
export function reminderPresets(now: number): ReminderPreset[] {
  const presets: ReminderPreset[] = [{ label: "1시간 뒤", at: now + HOUR }];
  const evening = at(now, 0, 18);
  if (evening - now > HOUR) presets.push({ label: "오늘 저녁 6시", at: evening });
  presets.push({ label: "내일 오전 9시", at: at(now, 1, 9) });
  const day = new Date(now).getDay();
  const toMonday = ((8 - day) % 7) || 7;
  presets.push({ label: "다음 주 월요일 오전 9시", at: at(now, toMonday, 9) });
  return presets;
}

/** 목록·머리글 표시: "오늘 18:00", "내일 09:00", "10월 31일 (금) 09:00", 다른 해면 연도 포함 */
export function formatReminder(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (t: number) => at(t, 0, 0);
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / (24 * HOUR));
  if (days === 0) return `오늘 ${time}`;
  if (days === 1) return `내일 ${time}`;
  if (days === -1) return `어제 ${time}`;
  const weekday = "일월화수목금토"[d.getDay()];
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}년 ` : "";
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday}) ${time}`;
}

/** 휴지통에 없는 메모의 알림 중 지난 것(놓친 알림)과 남은 것 */
export function splitReminders(notes: Note[], now: number) {
  const active = notes.filter((n) => n.remindAt !== null && n.deletedAt === null);
  return {
    missed: active.filter((n) => n.remindAt! <= now),
    upcoming: active.filter((n) => n.remindAt! > now),
  };
}
