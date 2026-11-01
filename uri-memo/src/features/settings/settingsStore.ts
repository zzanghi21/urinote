import { create } from "zustand";
import { FONT_SCALE, parseSettings, type Settings } from "../../domain/settings";
import { setLocale, systemLocale } from "../../i18n";

/**
 * 설정은 localStorage 에 둔다. 같은 앱의 창들은 저장소를 함께 쓰고,
 * 한 창에서 바꾸면 다른 창에 `storage` 이벤트가 와서 바로 반영된다.
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

/** 테마·글자 크기·언어를 문서에 적용한다 (CSS 는 data-theme, --font-scale 을 본다) */
function apply(settings: Settings) {
  setLocale(settings.language === "system" ? systemLocale() : settings.language);
  const root = document.documentElement;
  const theme = settings.theme === "system" ? (dark?.matches ? "dark" : "light") : settings.theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.setProperty("--font-scale", String(FONT_SCALE[settings.fontSize]));
}

interface SettingsState extends Settings {
  /** 설정 창 (Hub) */
  dialogOpen: boolean;
  setDialogOpen(open: boolean): void;
  update(patch: Partial<Settings>): void;
  /** 가져오기 등으로 설정 전체를 바꾼다 */
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

/** 창을 그리기 전에 한 번 호출한다 */
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
