import {
  newNote,
  titleFromText,
  TRASH_RETENTION_MS,
  type Note,
  type NoteColor,
  type NoteFilter,
} from "./note";
import type { NoteRepository } from "./repository";

export type NoteEdit = Partial<
  Pick<Note, "content" | "plainText" | "color" | "pinned" | "folderId">
>;

export class NoteService {
  constructor(
    private readonly repo: NoteRepository,
    private readonly now: () => number = Date.now,
  ) {}

  list(filter: NoteFilter) {
    return this.repo.list(filter);
  }

  get(id: string) {
    return this.repo.get(id);
  }

  async create(color: NoteColor = "yellow"): Promise<Note> {
    const note = newNote({ color }, this.now());
    await this.repo.upsert(note);
    return note;
  }

  async edit(id: string, edit: NoteEdit): Promise<Note | null> {
    return this.mutate(id, (note) => {
      const next = { ...note, ...edit };
      if (edit.plainText !== undefined) next.title = titleFromText(edit.plainText);
      return next;
    });
  }

  trash(id: string) {
    return this.mutate(id, (note) => ({ ...note, deletedAt: this.now(), pinned: false }));
  }

  restore(id: string) {
    return this.mutate(id, (note) => ({ ...note, deletedAt: null }));
  }

  /**
   * 영구 삭제. 동기화 전(M3)에는 행을 바로 지운다.
   * 동기화 도입 후에는 툼스톤을 서버에 올린 뒤 지우도록 바꾼다.
   */
  deleteForever(id: string) {
    return this.repo.remove(id);
  }

  purgeExpiredTrash() {
    return this.repo.purgeTrash(this.now() - TRASH_RETENTION_MS);
  }

  /**
   * 내용 없이 떠난 메모를 지운다 (스티키 메모 관례). 아직 서버에 올라간 적 없는 메모만 대상이다.
   * 대기 중인 편집 뒤에 실행되므로 방금 입력한 내용이 있으면 지우지 않는다.
   */
  discardIfEmpty(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const note = await this.repo.get(id);
      if (!note || note.plainText.trim() !== "" || note.remindAt !== null || note.rev !== 0) {
        return false;
      }
      await this.repo.remove(id);
      return true;
    });
  }

  /** 읽기-수정-쓰기가 서로 끼어들어 변경이 유실되지 않도록 변경을 한 줄로 실행한다 */
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private mutate(id: string, fn: (note: Note) => Note): Promise<Note | null> {
    return this.enqueue(async () => {
      const note = await this.repo.get(id);
      if (!note) return null;
      const next = { ...fn(note), updatedAt: this.now(), dirty: true };
      await this.repo.upsert(next);
      return next;
    });
  }
}
