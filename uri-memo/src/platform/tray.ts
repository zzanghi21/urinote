import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";
import { isDesktopApp, isLinux } from "./env";
import { globalKey } from "./shortcuts";

/** Sets tray menu labels in the current language (menu IDs from src-tauri/src/desktop.rs) */
export async function updateTrayLabels() {
  if (!isDesktopApp) return;
  await invoke("tray_set_labels", {
    labels: {
      // the Linux tray (AppIndicator) can't show shortcuts
      new: isLinux ? t("새 메모") : t("새 메모") + "\t" + globalKey("N"),
      show_all: t("모든 메모 보이기"),
      hide_all: t("모든 메모 숨기기"),
      hub: t("메모 목록 열기"),
      autostart: t("시작 시 자동 실행"),
      quit: t("종료"),
    },
  });
}
