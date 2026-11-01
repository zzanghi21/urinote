import { cleanFolderName, newFolder, type Folder, type FolderRepository } from "./folder";
import type { NoteService } from "./noteService";

export class FolderService {
  constructor(
    private readonly folders: FolderRepository,
    private readonly notes: NoteService,
    private readonly now: () => number = Date.now,
  ) {}

  list() {
    return this.folders.list();
  }

  /** null if the name is empty. Returns the existing folder if one has the same name */
  async create(name: string): Promise<Folder | null> {
    const clean = cleanFolderName(name);
    if (!clean) return null;
    const existing = await this.folders.list();
    const same = existing.find((f) => f.name.toLowerCase() === clean.toLowerCase());
    if (same) return same;
    const sort = Math.max(0, ...existing.map((f) => f.sort)) + 1;
    const folder = newFolder(clean, sort, this.now());
    await this.folders.upsert(folder);
    return folder;
  }

  async rename(id: string, name: string): Promise<Folder | null> {
    const clean = cleanFolderName(name);
    const folder = (await this.folders.list()).find((f) => f.id === id);
    if (!clean || !folder) return null;
    const next = { ...folder, name: clean, updatedAt: this.now() };
    await this.folders.upsert(next);
    return next;
  }

  /** Deletes only the folder. Its notes are kept and moved to "no folder" */
  async remove(id: string) {
    await this.notes.clearFolder(id);
    await this.folders.remove(id);
  }
}
