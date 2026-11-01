import { create } from "zustand";
import { FONT_SCALE, parseSettings, type Settings } from "../../domain/settings";
import { setLocale, systemLocale } from "../../i18n";

/**
 * Settings live in localStorage. The app's windows share that storage, and a change in one window
 * reaches the others immediately through the `storage` event.
 */
const STORAGE_KEY = "urinote:settings";

const dark =
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function load(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return parseSettings(null);
  }
}

/** Applies theme, text size and language to the document (CSS reads data-theme and --font-scale) */
function apply(settings: Settings) {
  setLocale(settings.language === "system" ? systemLocale() : settings.language);
  const root = document.documentElement;
  const theme = settings.theme === "system" ? (dark?.matches ? "dark" : "light") : settings.theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.setProperty("--font-scale", String(FONT_SCALE[settings.fontSize]));
}

interface SettingsState extends Settings {
  /** Settings dialog (hub) */
  dialogOpen: boolean;
  setDialogOpen(open: boolean): void;
  update(patch: Partial<Settings>): void;
  /** Replaces all settings (e.g. on import) */
  replace(settings: unknown): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  dialogOpen: false,

  setDialogOpen(open) {
    set({ dialogOpen: open });
  },

  update(patch) {
    const next = parseSettings({ ...pick(get()), ...patch });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set(next);
    apply(next);
  },

  replace(settings) {
    get().update(parseSettings(settings));
  },
}));

const pick = ({ theme, defaultColor, fontSize, language }: Settings): Settings => ({
  theme,
  defaultColor,
  fontSize,
  language,
});

export const currentSettings = (): Settings => pick(useSettings.getState());

/** Call once before rendering the window */
export function initSettings() {
  apply(currentSettings());
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = load();
    useSettings.setState(next);
    apply(next);
  });
  dark?.addEventListener("change", () => apply(currentSettings()));
}
