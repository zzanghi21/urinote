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

  /** 이름이 비어 있으면 null. 같은 이름의 폴더가 있으면 그 폴더를 돌려준다 */
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

  /** 폴더만 지운다. 안의 메모는 지우지 않고 "폴더 없음"으로 옮긴다 */
  async remove(id: string) {
    await this.notes.clearFolder(id);
    await this.folders.remove(id);
  }
}
