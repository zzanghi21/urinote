import { create } from "zustand";
import { en } from "./en";

/**
 * UI text translation (Korean by default, English). The Korean text itself is the key:
 *   t("메모 검색")  →  the en.ts translation in English, otherwise the Korean
 *   t("친구 {count}명", { count: 3 })  →  fills in {name} placeholders
 *   t("고정@tab")  →  "고정" in Korean, a different English translation of the same word ("Pinned")
 * tests/i18n.test.ts catches text missing from en.ts.
 */

export type Locale = "ko" | "en";
export type Vars = Record<string, string | number>;
/** English translation: a string, or a function that picks by value (plurals etc.) */
export type Translation = string | ((vars: Vars) => string);

/** Korean for tests and the first paint; setLocale switches once settings are read */
const localeStore = create<{ locale: Locale }>(() => ({ locale: "ko" }));

export function setLocale(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  localeStore.setState({ locale });
}

export const currentLocale = () => localeStore.getState().locale;

/** For components: the current language (re-renders on change) */
export const useLocale = () => localeStore((s) => s.locale);

/** For the "system" setting: Korean if the device language is Korean, otherwise English */
export const systemLocale = (): Locale =>
  (navigator.languages?.[0] ?? navigator.language ?? "ko").toLowerCase().startsWith("ko")
    ? "ko"
    : "en";

export function t(ko: string, vars: Vars = {}): string {
  // text after @ (as in "고정@tab") distinguishes different translations of the same Korean text (not shown in Korean)
  const base = ko.split("@")[0];
  const tr: Translation = currentLocale() === "en" ? (en[ko] ?? base) : base;
  const text = typeof tr === "function" ? tr(vars) : tr;
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** For components: re-renders when the language changes */
export function useT() {
  useLocale();
  return t;
}
