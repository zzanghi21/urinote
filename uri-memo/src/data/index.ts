import { isTauri } from "@tauri-apps/api/core";
import type { DocStore } from "../domain/docStore";
import type { NoteRepository } from "../domain/repository";
import { MemoryDocStore } from "./local/memoryDocStore";
import { MemoryNoteRepository } from "./local/memoryRepo";

export interface Stores {
  notes: NoteRepository;
  docs: DocStore;
}

let stores: Promise<Stores> | null = null;

/** Tauri 앱에서는 SQLite, 브라우저 미리보기에서는 localStorage 기반 저장소를 쓴다. 창마다 한 번만 연다. */
export function openStores(): Promise<Stores> {
  stores ??= (async () => {
    if (isTauri()) {
      const [{ default: Database }, { SqliteNoteRepository, DB_URL }, { SqliteDocStore }] =
        await Promise.all([
          import("@tauri-apps/plugin-sql"),
          import("./local/sqliteRepo"),
          import("./local/sqliteDocStore"),
        ]);
      const db = await Database.load(DB_URL);
      return { notes: new SqliteNoteRepository(db), docs: new SqliteDocStore(db) };
    }
    return {
      notes: new MemoryNoteRepository("urinote:notes"),
      docs: new MemoryDocStore("urinote:docs"),
    };
  })();
  return stores;
}
