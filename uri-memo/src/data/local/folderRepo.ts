import type Database from "@tauri-apps/plugin-sql";
import { compareFolders, type Folder, type FolderRepository } from "../../domain/folder";

interface FolderRow {
  id: string;
  name: string;
  sort: number;
  created_at: number;
  updated_at: number;
}

const toFolder = (r: FolderRow): Folder => ({
  id: r.id,
  name: r.name,
  sort: r.sort,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteFolderRepository implements FolderRepository {
  constructor(private readonly db: Database) {}

  async list() {
    const rows = await this.db.select<FolderRow[]>(
      "SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort, name",
    );
    return rows.map(toFolder);
  }

  async upsert(f: Folder) {
    await this.db.execute(
      `INSERT INTO folders (id, name, sort, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort,
         updated_at = excluded.updated_at, deleted_at = NULL`,
      [f.id, f.name, f.sort, f.createdAt, f.updatedAt],
    );
  }

  async remove(id: string) {
    await this.db.execute("DELETE FROM folders WHERE id = $1", [id]);
  }
}

/** 테스트와 브라우저 미리보기용 */
export class MemoryFolderRepository implements FolderRepository {
  private folders = new Map<string, Folder>();

  constructor(private readonly storageKey?: string) {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) for (const f of JSON.parse(saved) as Folder[]) this.folders.set(f.id, f);
    }
  }

  async list() {
    return [...this.folders.values()].sort(compareFolders);
  }

  async upsert(f: Folder) {
    this.folders.set(f.id, { ...f });
    this.persist();
  }

  async remove(id: string) {
    this.folders.delete(id);
    this.persist();
  }

  private persist() {
    if (this.storageKey && typeof localStorage !== "undefined") {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.folders.values()]));
    }
  }
}
