import type { Note, NoteFilter } from "./note";

export interface NoteRepository {
  list(filter: NoteFilter): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  upsert(note: Note): Promise<void>;
  /** 영구 삭제 */
  remove(id: string): Promise<void>;
  /** 폴더를 지울 때: 그 폴더의 메모(휴지통 포함)를 폴더 없음으로. 수정 시각은 바꾸지 않는다 */
  clearFolder(folderId: string): Promise<void>;
  /** deletedAt이 before 이전인 휴지통 메모를 영구 삭제하고 개수를 반환 */
  purgeTrash(before: number): Promise<number>;
}
