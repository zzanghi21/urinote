import Database from "@tauri-apps/plugin-sql";
import type { Note, NoteColor, NoteFilter } from "../../domain/note";
import type { NoteRepository } from "../../domain/repository";

/** src-tauri/src/lib.rs 의 DB_URL 과 같아야 한다 */
export const DB_URL = "sqlite:urinote.db";

/** trigram 토크나이저는 3글자 이상부터 매칭되므로 짧은 검색어는 LIKE 로 처리한다 */
const FTS_MIN_QUERY = 3;

interface NoteRow {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  plain_text: string;
  color: string;
  pinned: number;
  remind_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  rev: number;
  dirty: number;
}

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  folderId: row.folder_id,
  title: row.title,
  content: row.content,
  plainText: row.plain_text,
  color: row.color as NoteColor,
  pinned: row.pinned === 1,
  remindAt: row.remind_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  rev: row.rev,
  dirty: row.dirty === 1,
});

export class SqliteNoteRepository implements NoteRepository {
  private constructor(private readonly db: Database) {}

  static async open(): Promise<SqliteNoteRepository> {
    return new SqliteNoteRepository(await Database.load(DB_URL));
  }

  async list(filter: NoteFilter): Promise<Note[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.view === "trash") {
      where.push("n.deleted_at IS NOT NULL");
    } else {
      where.push("n.deleted_at IS NULL");
      if (filter.view === "pinned") where.push("n.pinned = 1");
    }

    const query = filter.query?.trim();
    let from = "notes n";
    if (query) {
      if (query.length >= FTS_MIN_QUERY) {
        from = "notes n JOIN notes_fts f ON f.rowid = n.rowid";
        where.push(`notes_fts MATCH $${params.length + 1}`);
        params.push(`"${query.replaceAll('"', '""')}"`);
      } else {
        const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
        where.push(
          `(n.title LIKE $${params.length + 1} ESCAPE '\\' OR n.plain_text LIKE $${params.length + 2} ESCAPE '\\')`,
        );
        params.push(pattern, pattern);
      }
    }

    const order =
      filter.view === "trash" ? "n.deleted_at DESC" : "n.pinned DESC, n.updated_at DESC";
    const rows = await this.db.select<NoteRow[]>(
      `SELECT n.* FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${order}`,
      params,
    );
    return rows.map(toNote);
  }

  async get(id: string): Promise<Note | null> {
    const rows = await this.db.select<NoteRow[]>("SELECT * FROM notes WHERE id = $1", [id]);
    return rows[0] ? toNote(rows[0]) : null;
  }

  async upsert(note: Note): Promise<void> {
    await this.db.execute(
      `INSERT INTO notes (id, folder_id, title, content, plain_text, color, pinned, remind_at,
                          created_at, updated_at, deleted_at, rev, dirty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT(id) DO UPDATE SET
         folder_id = excluded.folder_id, title = excluded.title, content = excluded.content,
         plain_text = excluded.plain_text, color = excluded.color, pinned = excluded.pinned,
         remind_at = excluded.remind_at, updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at, rev = excluded.rev, dirty = excluded.dirty`,
      [
        note.id,
        note.folderId,
        note.title,
        note.content,
        note.plainText,
        note.color,
        note.pinned ? 1 : 0,
        note.remindAt,
        note.createdAt,
        note.updatedAt,
        note.deletedAt,
        note.rev,
        note.dirty ? 1 : 0,
      ],
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.execute("DELETE FROM notes WHERE id = $1", [id]);
  }

  async purgeTrash(before: number): Promise<number> {
    const result = await this.db.execute(
      "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < $1",
      [before],
    );
    return result.rowsAffected;
  }
}
