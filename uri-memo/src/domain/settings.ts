import { NOTE_COLORS, type NoteColor } from "./note";

/** 앱 설정 (E-01). 기기마다 따로 두고, 같은 기기의 모든 창(Hub·스티키)이 함께 쓴다 */
export interface Settings {
  theme: Theme;
  /** 새 메모 색상 */
  defaultColor: NoteColor;
  fontSize: FontSize;
  language: Language;
}

export const LANGUAGES = ["system", "ko", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const FONT_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** 메모 본문 글자 크기 배율 */
export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.875,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  defaultColor: "yellow",
  fontSize: "medium",
  language: "system",
};

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  (values as readonly unknown[]).includes(value) ? (value as T) : fallback;

/** 저장된 값(또는 가져온 파일)을 읽는다. 모르는 값은 기본값으로 */
export function parseSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: oneOf(THEMES, r.theme, DEFAULT_SETTINGS.theme),
    defaultColor: oneOf(NOTE_COLORS, r.defaultColor, DEFAULT_SETTINGS.defaultColor),
    fontSize: oneOf(FONT_SIZES, r.fontSize, DEFAULT_SETTINGS.fontSize),
    language: oneOf(LANGUAGES, r.language, DEFAULT_SETTINGS.language),
  };
}
