import { isMac } from "./env";

/**
 * Shortcut labels. Key handling itself accepts both Ctrl and ⌘ (App.tsx, TipTap's Mod key).
 *   appKey("N")    → Windows/Linux "Ctrl+N", macOS "⌘N"
 *   globalKey("N") → Windows/Linux "Ctrl+Alt+N", macOS "⌥⌘N" (must match src-tauri/src/desktop.rs)
 */
export const appKey = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

export const globalKey = (key: string) => (isMac ? `⌥⌘${key}` : `Ctrl+Alt+${key}`);
