import { currentLocale, t } from "../../i18n";

const INTL_LOCALE = { ko: "ko-KR", en: "en-US" } as const;

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(INTL_LOCALE[currentLocale()], options);

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

/** Time if today, "yesterday", month/day if this year, otherwise the full date */
export function formatNoteTime(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (days <= 0) return formatter({ hour: "numeric", minute: "2-digit" }).format(ms);
  if (days === 1) return t("어제");
  if (new Date(ms).getFullYear() === new Date(now).getFullYear()) {
    return formatter({ month: "short", day: "numeric" }).format(ms);
  }
  return formatter({ dateStyle: "medium" }).format(ms);
}
