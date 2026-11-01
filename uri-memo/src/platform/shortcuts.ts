import { isMac } from "./env";

/**
 * 단축키 표시. 실제 키 처리는 Ctrl·⌘ 모두 받는다 (App.tsx, TipTap 의 Mod 키).
 *   appKey("N")    → Windows·Linux "Ctrl+N", macOS "⌘N"
 *   globalKey("N") → Windows·Linux "Ctrl+Alt+N", macOS "⌥⌘N" (src-tauri/src/desktop.rs 와 같아야 한다)
 */
export const appKey = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

export const globalKey = (key: string) => (isMac ? `⌥⌘${key}` : `Ctrl+Alt+${key}`);
