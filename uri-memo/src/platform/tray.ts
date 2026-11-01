import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";
import { isDesktopApp } from "./env";

/** 트레이 메뉴 문구를 지금 언어로 바꾼다 (src-tauri/src/desktop.rs 의 메뉴 ID) */
export async function updateTrayLabels() {
  if (!isDesktopApp) return;
  await invoke("tray_set_labels", {
    labels: {
      new: t("새 메모") + "\tCtrl+Alt+N",
      show_all: t("모든 메모 보이기"),
      hide_all: t("모든 메모 숨기기"),
      hub: t("메모 목록 열기"),
      autostart: t("시작 시 자동 실행"),
      quit: t("종료"),
    },
  });
}
