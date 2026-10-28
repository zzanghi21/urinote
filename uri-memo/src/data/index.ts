import { isTauri } from "@tauri-apps/api/core";
import type { NoteRepository } from "../domain/repository";
import { MemoryNoteRepository } from "./local/memoryRepo";

/** Tauri 앱에서는 SQLite, 브라우저 미리보기에서는 localStorage 기반 저장소를 쓴다. */
export async function openNoteRepository(): Promise<NoteRepository> {
  if (isTauri()) {
    const { SqliteNoteRepository } = await import("./local/sqliteRepo");
    return SqliteNoteRepository.open();
  }
  return new MemoryNoteRepository("urinote:notes");
}
