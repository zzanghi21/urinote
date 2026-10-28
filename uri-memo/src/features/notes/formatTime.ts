const time = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const monthDay = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

/** 오늘이면 시각, 어제면 "어제", 올해면 월/일, 그 외에는 연월일 */
export function formatNoteTime(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (days <= 0) return time.format(ms);
  if (days === 1) return "어제";
  if (new Date(ms).getFullYear() === new Date(now).getFullYear()) return monthDay.format(ms);
  return fullDate.format(ms);
}
