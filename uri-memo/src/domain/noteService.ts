import type { DocStore } from "./docStore";
import {
  newNote,
  titleFromText,
  TRASH_RETENTION_MS,
  type Note,
  type NoteColor,
  type NoteFilter,
} from "./note";
import { legacyContentToUpdate } from "./noteDoc";
import type { NoteRepository } from "./repository";

/** 본문은 Yjs 문서로 따로 저장하므로, 여기서는 목록·검색용 텍스트 캐시와 개인 메타데이터만 바꾼다 */
export type NoteEdit = Partial<Pick<Note, "plainText" | "color" | "pinned" | "folderId">>;

/** 업데이트 로그가 이 건수를 넘는 문서를 스냅샷으로 합친다 */
export const LOCAL_COMPACT_THRESHOLD = 50;

export class NoteService {
  constructor(
    private readonly repo: NoteRepository,
    private readonly docs: DocStore,
    private readonly now: () => number = Date.now,
  ) {}

  list(filter: NoteFilter) {
    return this.repo.list(filter);
  }

  get(id: string) {
    return this.repo.get(id);
  }

  async create(color: NoteColor = "yellow", folderId: string | null = null): Promise<Note> {
    const note = newNote({ color, folderId }, this.now());
    await this.repo.upsert(note);
    return note;
  }

  /** 지운 폴더의 메모를 폴더 없음으로 (다른 편집과 섞이지 않게 순서대로) */
  clearFolder(folderId: string) {
    return this.enqueue(() => this.repo.clearFolder(folderId));
  }

  async edit(id: string, edit: NoteEdit): Promise<Note | null> {
    return this.mutate(id, (note) => {
      const next = { ...note, ...edit };
      if (edit.plainText !== undefined) next.title = titleFromText(edit.plainText);
      return next;
    });
  }

  /** 알림 시각 설정·해제. 내용이 바뀐 것은 아니므로 수정 시각(목록 순서)은 그대로 둔다 */
  setReminder(id: string, remindAt: number | null) {
    return this.mutate(id, (note) => ({ ...note, remindAt }), { touch: false });
  }

  /** 휴지통에 없는 메모 중 알림이 있는 것 */
  async withReminders(): Promise<Note[]> {
    return (await this.repo.list({ view: "all" })).filter((n) => n.remindAt !== null);
  }

  trash(id: string) {
    return this.mutate(id, (note) => ({ ...note, deletedAt: this.now(), pinned: false }));
  }

  restore(id: string) {
    return this.mutate(id, (note) => ({ ...note, deletedAt: null }));
  }

  /**
   * 영구 삭제. 동기화 전(M3b)에는 행을 바로 지운다.
   * 동기화 도입 후에는 툼스톤을 서버에 올린 뒤 지우도록 바꾼다.
   */
  deleteForever(id: string) {
    return this.enqueue(async () => {
      await this.repo.remove(id);
      await this.docs.remove(id);
    });
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
      // 공유 메모는 친구가 막 만든 빈 메모일 수 있으므로 지우지 않는다 (DESIGN.md 4.9.7)
      if (
        !note ||
        note.spaceId !== null ||
        note.plainText.trim() !== "" ||
        note.remindAt !== null ||
        note.rev !== 0
      ) {
        return false;
      }
      await this.repo.remove(id);
      await this.docs.remove(id);
      return true;
    });
  }

  /**
   * M1/M2 에서 TipTap JSON 으로 저장한 본문을 Yjs 문서로 옮긴다.
   * 같은 메모를 두 번 변환하면 내용이 중복되므로, 스티키 창을 열기 전에 Hub 에서 한 번만 실행한다.
   */
  migrateLegacyContent(): Promise<number> {
    return this.enqueue(async () => {
      const notes = [
        ...(await this.repo.list({ view: "all" })),
        ...(await this.repo.list({ view: "trash" })),
      ].filter((note) => note.content !== "");
      for (const note of notes) {
        const existing = await this.docs.load(note.id);
        const update = existing.length === 0 ? legacyContentToUpdate(note.content) : null;
        if (update) await this.docs.append(note.id, update, "local");
        await this.repo.upsert({ ...note, content: "" });
      }
      return notes.length;
    });
  }

  /**
   * 친구가 공유한 메모를 내 기기에 만든다. 모든 멤버가 같은 메모 ID 를 쓴다.
   * 본문은 따로 문서 저장소에 넣고, 여기서는 목록용 캐시와 내 개인 설정만 만든다.
   */
  adoptShared(id: string, plainText: string, color: NoteColor): Promise<Note> {
    return this.enqueue(async () => {
      const existing = await this.repo.get(id);
      const note = existing
        ? { ...existing, spaceId: id, deletedAt: null }
        : newNote(
            { id, spaceId: id, color, plainText, title: titleFromText(plainText) },
            this.now(),
          );
      await this.repo.upsert(note);
      return note;
    });
  }

  /** 공유 시작(spaceId = 메모 ID) 또는 개인 메모로 되돌리기(null) */
  setSpace(id: string, spaceId: string | null) {
    return this.mutate(id, (note) => ({ ...note, spaceId }));
  }

  compactDocs(threshold = LOCAL_COMPACT_THRESHOLD) {
    return this.docs.compact(threshold);
  }

  /** 읽기-수정-쓰기가 서로 끼어들어 변경이 유실되지 않도록 변경을 한 줄로 실행한다 */
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private mutate(
    id: string,
    fn: (note: Note) => Note,
    { touch = true } = {},
  ): Promise<Note | null> {
    return this.enqueue(async () => {
      const note = await this.repo.get(id);
      if (!note) return null;
      const next = { ...fn(note), updatedAt: touch ? this.now() : note.updatedAt, dirty: true };
      await this.repo.upsert(next);
      return next;
    });
  }
}
