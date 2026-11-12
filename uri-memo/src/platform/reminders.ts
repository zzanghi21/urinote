import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  cancel,
  isPermissionGranted,
  pending,
  requestPermission,
  Schedule,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { inTauri, isDesktopApp, isMobile } from "./env";

/** Same shape as in src-tauri/src/reminders.rs */
export interface ScheduledReminder {
  noteId: string;
  at: number;
  title: string;
  body: string;
}

const isMobileApp = inTauri && isMobile;

/**
 * Replaces the whole schedule.
 * - Desktop: the Rust scheduler (runs while the app is in the tray)
 * - Mobile: scheduled OS notifications, delivered by the OS even if the app is closed
 */
export async function scheduleReminders(reminders: ScheduledReminder[]) {
  if (isDesktopApp) await invoke("reminders_set", { reminders });
  else if (isMobileApp) await scheduleMobile(reminders);
}

/**
 * Desktop: a reminder is due (Rust has already shown the OS notification).
 * Mobile: the user tapped a reminder notification, including the tap that started the app.
 * The tap only carries the notification ID, so `candidates` lists the note IDs it may belong to.
 */
export async function onReminderDue(
  handler: (noteId: string) => void,
  candidates: () => Promise<string[]>,
): Promise<() => void> {
  if (isDesktopApp) return listen<string>("reminder://due", (e) => handler(e.payload));
  if (!isMobileApp) return () => {};
  const tapped = async (id: number | undefined) => {
    if (id === undefined) return;
    const noteId = (await candidates()).find((n) => notificationId(n) === id);
    if (noteId) handler(noteId);
  };
  try {
    // Android only (ReminderTapPlugin.kt); the call fails elsewhere
    const listener = await addPluginListener<TapEvent>("reminder-tap", "tap", (e) => void tapped(e.id));
    void tapped((await invoke<TapEvent>("plugin:reminder-tap|takePending")).id);
    return () => void listener.unregister();
  } catch {
    return () => {};
  }
}

interface TapEvent {
  id?: number;
}

/** Whether due reminders fire while the app is closed (the OS delivers them) */
export const remindersFireWhileClosed = isMobileApp;

/** Stable 31-bit notification ID per note (Android needs an int) */
export function notificationId(noteId: string) {
  let hash = 0;
  for (const ch of noteId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash & 0x7fffffff;
}

let permission: Promise<boolean> | null = null;

async function scheduleMobile(reminders: ScheduledReminder[]) {
  if (reminders.length > 0) {
    permission ??= (async () =>
      (await isPermissionGranted()) || (await requestPermission()) === "granted")();
    if (!(await permission)) return;
  }
  const scheduled = (await pending()).map((p) => p.id);
  if (scheduled.length > 0) await cancel(scheduled);
  for (const r of reminders) {
    sendNotification({
      id: notificationId(r.noteId),
      title: r.title,
      body: r.body,
      schedule: Schedule.at(new Date(r.at), false, true),
      extra: { noteId: r.noteId },
    });
  }
}
