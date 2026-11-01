import { isTauri } from "@tauri-apps/api/core";
import type { DocStore } from "../domain/docStore";
import type { FolderRepository } from "../domain/folder";
import type { NoteRepository } from "../domain/repository";
import { MemoryFolderRepository } from "./local/folderRepo";
import type { ContactsRepository } from "./local/contactsRepo";
import type { SharesRepository } from "./local/sharesRepo";
import { MemoryDocStore } from "./local/memoryDocStore";
import { MemoryNoteRepository } from "./local/memoryRepo";

export interface Stores {
  notes: NoteRepository;
  docs: DocStore;
  folders: FolderRepository;
  /** 친구 공유는 Tauri 앱에서만 (브라우저 미리보기에는 없음) */
  contacts: ContactsRepository | null;
  shares: SharesRepository | null;
}

let stores: Promise<Stores> | null = null;

/** Tauri 앱에서는 SQLite, 브라우저 미리보기에서는 localStorage 기반 저장소를 쓴다. 창마다 한 번만 연다. */
export function openStores(): Promise<Stores> {
  stores ??= (async () => {
    if (isTauri()) {
      const [
        { default: Database },
        { SqliteNoteRepository, DB_URL },
        { SqliteDocStore },
        { SqliteContactsRepository },
        { SqliteSharesRepository },
        { SqliteFolderRepository },
      ] = await Promise.all([
        import("@tauri-apps/plugin-sql"),
        import("./local/sqliteRepo"),
        import("./local/sqliteDocStore"),
        import("./local/contactsRepo"),
        import("./local/sharesRepo"),
        import("./local/folderRepo"),
      ]);
      const db = await Database.load(DB_URL);
      return {
        notes: new SqliteNoteRepository(db),
        docs: new SqliteDocStore(db),
        folders: new SqliteFolderRepository(db),
        contacts: new SqliteContactsRepository(db),
        shares: new SqliteSharesRepository(db),
      };
    }
    return {
      notes: new MemoryNoteRepository("urinote:notes"),
      docs: new MemoryDocStore("urinote:docs"),
      folders: new MemoryFolderRepository("urinote:folders"),
      contacts: null,
      shares: null,
    };
  })();
  return stores;
}
