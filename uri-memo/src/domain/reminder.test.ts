import { describe, expect, it } from "vitest";
import { MemoryDocStore } from "../data/local/memoryDocStore";
import { MemoryNoteRepository } from "../data/local/memoryRepo";
import { newNote } from "./note";
import { NoteService } from "./noteService";
import {
  formatReminder,
  fromLocalInput,
  reminderPresets,
  splitReminders,
  toLocalInput,
} from "./reminder";

/** 2026-10-30 (금) 14:30 (기기 시간대) */
const NOW = new Date(2026, 9, 30, 14, 30).getTime();

describe("reminder helpers", () => {
  it("round-trips the datetime-local value", () => {
    expect(toLocalInput(NOW)).toBe("2026-10-30T14:30");
    expect(fromLocalInput("2026-10-30T14:30")).toBe(NOW);
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("2026-10-30")).toBeNull();
  });

  it("offers presets in the future only", () => {
    const presets = reminderPresets(NOW);
    expect(presets.map((p) => p.label)).toEqual([
      "1시간 뒤",
      "오늘 저녁 6시",
      "내일 오전 9시",
      "다음 주 월요일 오전 9시",
    ]);
    expect(presets.every((p) => p.at > NOW)).toBe(true);
    expect(new Date(presets[3].at)).toEqual(new Date(2026, 10, 2, 9, 0));
    // 저녁 6시가 1시간 안쪽이거나 지났으면 뺀다
    expect(reminderPresets(new Date(2026, 9, 30, 17, 30).getTime()).map((p) => p.label)).not.toContain(
      "오늘 저녁 6시",
    );
  });

  it("formats relative days", () => {
    expect(formatReminder(new Date(2026, 9, 30, 18, 0).getTime(), NOW)).toBe("오늘 18:00");
    expect(formatReminder(new Date(2026, 9, 31, 9, 5).getTime(), NOW)).toBe("내일 09:05");
    expect(formatReminder(new Date(2026, 10, 2, 9, 0).getTime(), NOW)).toBe("11월 2일 (월) 09:00");
    expect(formatReminder(new Date(2027, 0, 4, 9, 0).getTime(), NOW)).toBe("2027년 1월 4일 (월) 09:00");
  });

  it("splits missed and upcoming reminders, ignoring the trash", () => {
    const notes = [
      newNote({ id: "past", remindAt: NOW - 1 }),
      newNote({ id: "future", remindAt: NOW + 1 }),
      newNote({ id: "trashed", remindAt: NOW - 1, deletedAt: NOW }),
      newNote({ id: "none" }),
    ];
    const { missed, upcoming } = splitReminders(notes, NOW);
    expect(missed.map((n) => n.id)).toEqual(["past"]);
    expect(upcoming.map((n) => n.id)).toEqual(["future"]);
  });
});

describe("NoteService.setReminder", () => {
  it("does not move the note in the list (keeps updatedAt)", async () => {
    let now = 1000;
    const service = new NoteService(new MemoryNoteRepository(), new MemoryDocStore(), () => now);
    const note = await service.create();
    now = 5000;
    const next = await service.setReminder(note.id, NOW);
    expect(next).toMatchObject({ remindAt: NOW, updatedAt: 1000 });
    expect((await service.withReminders()).map((n) => n.id)).toEqual([note.id]);
    await service.setReminder(note.id, null);
    expect(await service.withReminders()).toEqual([]);
  });
});
