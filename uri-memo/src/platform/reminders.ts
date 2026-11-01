import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isDesktopApp } from "./env";

/** Same shape as in src-tauri/src/reminders.rs */
export interface ScheduledReminder {
  noteId: string;
  at: number;
  title: string;
  body: string;
}

/** Replaces the whole schedule. Desktop only (mobile uses scheduled OS notifications) */
export async function scheduleReminders(reminders: ScheduledReminder[]) {
  if (isDesktopApp) await invoke("reminders_set", { reminders });
}

/** A reminder is due (Rust has already shown the OS notification) */
export async function onReminderDue(handler: (noteId: string) => void): Promise<() => void> {
  if (!isDesktopApp) return () => {};
  return listen<string>("reminder://due", (e) => handler(e.payload));
}
