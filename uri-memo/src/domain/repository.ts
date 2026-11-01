import type { Note, NoteFilter } from "./note";

export interface NoteRepository {
  list(filter: NoteFilter): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  upsert(note: Note): Promise<void>;
  /** Deletes forever */
  remove(id: string): Promise<void>;
  /** When deleting a folder: moves its notes (trash included) to no folder. Does not change the modified time */
  clearFolder(folderId: string): Promise<void>;
  /** Deletes trashed notes with deletedAt before `before` forever and returns the count */
  purgeTrash(before: number): Promise<number>;
}
