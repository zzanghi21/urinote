import { isTauri } from "@tauri-apps/api/core";

export const inTauri = isTauri();
export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/** Whether desktop-only features (sticky windows, tray, …) are available */
export const isDesktopApp = inTauri && !isMobile;
export const isMac = !isMobile && /Mac/i.test(navigator.userAgent);
export const isLinux = !isMobile && /Linux/i.test(navigator.userAgent);
