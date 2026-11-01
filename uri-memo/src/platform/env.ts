import { isTauri } from "@tauri-apps/api/core";

export const inTauri = isTauri();
export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/** 스티키 창·트레이 등 데스크톱 전용 기능을 쓸 수 있는지 */
export const isDesktopApp = inTauri && !isMobile;
export const isMac = !isMobile && /Mac/i.test(navigator.userAgent);
export const isLinux = !isMobile && /Linux/i.test(navigator.userAgent);
