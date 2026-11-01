import { create } from "zustand";
import { en } from "./en";

/**
 * 화면 문구 번역 (한국어 기본, 영어). 한국어 문구를 그대로 키로 쓴다:
 *   t("메모 검색")  →  영어면 en.ts 의 번역, 없으면 한국어
 *   t("친구 {count}명", { count: 3 })  →  {이름} 자리에 값을 넣는다
 *   t("고정@tab")  →  한국어는 "고정", 영어는 같은 말의 다른 번역 ("Pinned")
 * en.ts 에 빠진 문구는 i18n.test.ts 가 찾아낸다.
 */

export type Locale = "ko" | "en";
export type Vars = Record<string, string | number>;
/** 영어 번역: 문자열 또는 (복수형 등) 값에 따라 고르는 함수 */
export type Translation = string | ((vars: Vars) => string);

/** 테스트·첫 화면은 한국어. 설정을 읽으면 setLocale 로 바뀐다 */
const localeStore = create<{ locale: Locale }>(() => ({ locale: "ko" }));

export function setLocale(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  localeStore.setState({ locale });
}

export const currentLocale = () => localeStore.getState().locale;

/** 컴포넌트용: 지금 언어 (바뀌면 다시 그린다) */
export const useLocale = () => localeStore((s) => s.locale);

/** "system" 설정일 때: 기기 언어가 한국어면 한국어, 아니면 영어 */
export const systemLocale = (): Locale =>
  (navigator.languages?.[0] ?? navigator.language ?? "ko").toLowerCase().startsWith("ko")
    ? "ko"
    : "en";

export function t(ko: string, vars: Vars = {}): string {
  // "고정@tab" 처럼 @ 뒤는 같은 한국어를 다르게 번역할 때 쓰는 구분자 (한국어에는 보이지 않음)
  const base = ko.split("@")[0];
  const tr: Translation = currentLocale() === "en" ? (en[ko] ?? base) : base;
  const text = typeof tr === "function" ? tr(vars) : tr;
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** 컴포넌트용: 언어가 바뀌면 다시 그린다 */
export function useT() {
  useLocale();
  return t;
}
