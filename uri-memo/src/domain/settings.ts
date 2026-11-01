import { NOTE_COLORS, type NoteColor } from "./note";

/** App settings (E-01). Per device, shared by every window (hub and stickies) on it */
export interface Settings {
  theme: Theme;
  /** Color of new notes */
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

/** Scale factor for note text size */
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

/** Reads stored values (or an imported file). Unknown values fall back to defaults */
export function parseSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: oneOf(THEMES, r.theme, DEFAULT_SETTINGS.theme),
    defaultColor: oneOf(NOTE_COLORS, r.defaultColor, DEFAULT_SETTINGS.defaultColor),
    fontSize: oneOf(FONT_SIZES, r.fontSize, DEFAULT_SETTINGS.fontSize),
    language: oneOf(LANGUAGES, r.language, DEFAULT_SETTINGS.language),
  };
}
