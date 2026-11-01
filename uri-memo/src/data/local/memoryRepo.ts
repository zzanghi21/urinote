import { compareNotes, matchesFilter, type Note, type NoteFilter } from "../../domain/note";
import type { NoteRepository } from "../../domain/repository";

/** Store for tests and the browser preview (npm run dev). With a localStorage key it survives reloads. */
export class MemoryNoteRepository implements NoteRepository {
  private notes = new Map<string, Note>();

  constructor(private readonly storageKey?: string) {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) for (const note of JSON.parse(saved) as Note[]) this.notes.set(note.id, note);
    }
  }

  async list(filter: NoteFilter): Promise<Note[]> {
    return [...this.notes.values()]
      .filter((note) => matchesFilter(note, filter))
      .sort(compareNotes(filter.view));
  }

  async get(id: string): Promise<Note | null> {
    return this.notes.get(id) ?? null;
  }

  async upsert(note: Note): Promise<void> {
    this.notes.set(note.id, { ...note });
    this.persist();
  }

  async remove(id: string): Promise<void> {
    this.notes.delete(id);
    this.persist();
  }

  async clearFolder(folderId: string): Promise<void> {
    for (const note of this.notes.values()) {
      if (note.folderId === folderId) note.folderId = null;
    }
    this.persist();
  }

  async purgeTrash(before: number): Promise<number> {
    let count = 0;
    for (const note of this.notes.values()) {
      if (note.deletedAt !== null && note.deletedAt < before) {
        this.notes.delete(note.id);
        count++;
      }
    }
    if (count) this.persist();
    return count;
  }

  private persist() {
    if (this.storageKey && typeof localStorage !== "undefined") {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.notes.values()]));
    }
  }
}
