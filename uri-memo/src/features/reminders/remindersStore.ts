import { create } from "zustand";
import { previewFromText } from "../../domain/note";
import type { NoteService } from "../../domain/noteService";
import { splitReminders } from "../../domain/reminder";
import { t } from "../../i18n";
import { isDesktopApp } from "../../platform/env";
import { emitNoteChanged } from "../../platform/events";
import { onReminderDue, scheduleReminders } from "../../platform/reminders";
import { openSticky } from "../../platform/stickyWindows";
import { useNotes } from "../notes/notesStore";

/**
 * 메모 알림 (Hub 창 전용, N-01 · DESIGN.md 4.7).
 * - 시작할 때 지난 알림은 "놓친 알림"으로 한 번 보여 주고 지운다
 * - 남은 알림 목록을 Rust 스케줄러에 넘기고, 메모가 바뀔 때마다 다시 넘긴다
 * - 알림 시각이 되면 그 메모를 스티키 창으로 열고 알림을 지운다 (한 번만 울림)
 */

const SYNC_DEBOUNCE_MS = 300;

export interface MissedReminder {
  id: string;
  title: string;
  at: number;
}

interface RemindersState {
  missed: MissedReminder[];
  init(service: NoteService): Promise<void>;
  dismissMissed(id: string): void;
  /** 놓친 알림의 메모를 연다 */
  openMissed(id: string): Promise<void>;
}

export const useReminders = create<RemindersState>((set, get) => {
  let service: NoteService | null = null;
  let timer: number | undefined;

  const sync = async () => {
    if (!service) return;
    const { upcoming } = splitReminders(await service.withReminders(), Date.now());
    await scheduleReminders(
      upcoming.map((n) => ({
        noteId: n.id,
        at: n.remindAt!,
        title: n.title || t("메모 알림"),
        body: previewFromText(n.plainText, 100) || t("Urinote 메모 알림"),
      })),
    );
  };

  const scheduleSync = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync().catch(console.error), SYNC_DEBOUNCE_MS);
  };

  const clear = async (id: string) => {
    await service?.setReminder(id, null);
    emitNoteChanged(id);
    await useNotes.getState().refresh();
  };

  return {
    missed: [],

    async init(svc) {
      service = svc;
      const { missed } = splitReminders(await svc.withReminders(), Date.now());
      set({
        missed: missed.map((n) => ({ id: n.id, title: n.title, at: n.remindAt! })),
      });
      for (const n of missed) await svc.setReminder(n.id, null);
      if (missed.length > 0) await useNotes.getState().refresh();

      await onReminderDue((noteId) => {
        void (async () => {
          if (isDesktopApp) await openSticky(noteId);
          else useNotes.getState().select(noteId);
          await clear(noteId);
        })();
      });
      // 메모 목록이 바뀔 때마다 (스티키 창에서의 변경 포함) 예약을 다시 넘긴다
      useNotes.subscribe((s, prev) => {
        if (s.notes !== prev.notes) scheduleSync();
      });
      await sync();
    },

    dismissMissed(id) {
      set({ missed: get().missed.filter((m) => m.id !== id) });
    },

    async openMissed(id) {
      get().dismissMissed(id);
      const notes = useNotes.getState();
      if (notes.view === "trash" || notes.folderId !== null) {
        await notes.setView("all");
        await notes.setFolder(null);
      }
      notes.select(id);
    },
  };
});
