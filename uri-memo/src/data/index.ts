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
  /** Friend sharing exists only in the Tauri app (not in the browser preview) */
  contacts: ContactsRepository | null;
  shares: SharesRepository | null;
}

let stores: Promise<Stores> | null = null;

/** SQLite in the Tauri app, localStorage-backed stores in the browser preview. Opened once per window. */
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
