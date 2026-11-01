import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isDesktopApp } from "./env";

/** src-tauri/src/reminders.rs 와 같은 형식 */
export interface ScheduledReminder {
  noteId: string;
  at: number;
  title: string;
  body: string;
}

/** 예약 목록 전체를 바꾼다. 데스크톱 앱에서만 (모바일은 M4 에서 OS 예약 알림으로) */
export async function scheduleReminders(reminders: ScheduledReminder[]) {
  if (isDesktopApp) await invoke("reminders_set", { reminders });
}

/** 알림 시각이 되었다 (OS 알림은 Rust 가 이미 띄움) */
export async function onReminderDue(handler: (noteId: string) => void): Promise<() => void> {
  if (!isDesktopApp) return () => {};
  return listen<string>("reminder://due", (e) => handler(e.payload));
}
