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

/** The body is stored separately as a Yjs document; this only changes the list/search text cache and personal metadata */
export type NoteEdit = Partial<Pick<Note, "plainText" | "color" | "pinned" | "folderId">>;

/** Documents whose update log exceeds this count are merged into the snapshot */
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

  /** Moves notes of a deleted folder to no folder (queued so it doesn't interleave with other edits) */
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

  /** Sets or clears the reminder. The content didn't change, so the modified time (list order) stays */
  setReminder(id: string, remindAt: number | null) {
    return this.mutate(id, (note) => ({ ...note, remindAt }), { touch: false });
  }

  /** Notes outside the trash that have a reminder */
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
   * Deletes forever. Before sync (M3b) the row is deleted right away.
   * Once sync exists, this should upload a tombstone first and then delete.
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
   * Deletes a note left empty (sticky-note convention). Only notes never uploaded to a server.
   * Runs after queued edits, so it does not delete a note that just received input.
   */
  discardIfEmpty(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const note = await this.repo.get(id);
      // shared notes may be empty notes a friend just created, so keep them (DESIGN.md 4.9.7)
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
   * Moves bodies saved as TipTap JSON (M1/M2) into Yjs documents.
   * Converting a note twice would duplicate its content, so the hub runs this once, before opening stickies.
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
   * Creates a note shared by a friend on this device. All members use the same note ID.
   * The body goes into the document store separately; this only creates the list cache and my settings.
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

  /** Starts sharing (spaceId = note ID) or turns it back into a personal note (null) */
  setSpace(id: string, spaceId: string | null) {
    return this.mutate(id, (note) => ({ ...note, spaceId }));
  }

  compactDocs(threshold = LOCAL_COMPACT_THRESHOLD) {
    return this.docs.compact(threshold);
  }

  /** Runs changes one at a time so interleaved read-modify-writes don't lose edits */
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
