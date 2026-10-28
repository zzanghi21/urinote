import type { Note, NoteFilter } from "./note";

export interface NoteRepository {
  list(filter: NoteFilter): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  upsert(note: Note): Promise<void>;
  /** 영구 삭제 */
  remove(id: string): Promise<void>;
  /** deletedAt이 before 이전인 휴지통 메모를 영구 삭제하고 개수를 반환 */
  purgeTrash(before: number): Promise<number>;
}
