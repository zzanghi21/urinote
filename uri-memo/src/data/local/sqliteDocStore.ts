import type Database from "@tauri-apps/plugin-sql";
import * as Y from "yjs";
import type { DocStore, DocUpdateOrigin } from "../../domain/docStore";
import { fromBase64, toBase64 } from "../../domain/noteDoc";

interface SnapshotRow {
  snapshot: string;
}

interface UpdateRow {
  seq: number;
  data: string;
}

export class SqliteDocStore implements DocStore {
  constructor(private readonly db: Database) {}

  async load(noteId: string): Promise<Uint8Array[]> {
    const [snapshots, updates] = await Promise.all([
      this.db.select<SnapshotRow[]>("SELECT snapshot FROM note_docs WHERE note_id = $1", [noteId]),
      this.db.select<UpdateRow[]>(
        "SELECT seq, data FROM note_doc_updates WHERE note_id = $1 ORDER BY seq",
        [noteId],
      ),
    ]);
    return [...snapshots.map((s) => s.snapshot), ...updates.map((u) => u.data)].map(fromBase64);
  }

  async append(noteId: string, update: Uint8Array, origin: DocUpdateOrigin): Promise<void> {
    await this.db.execute(
      "INSERT INTO note_doc_updates (note_id, data, origin, created_at) VALUES ($1, $2, $3, $4)",
      [noteId, toBase64(update), origin, Date.now()],
    );
  }

  /**
   * Writes the snapshot first, then deletes the merged log. If the app stops in between, the same
   * updates just exist in both the snapshot and the log, which is safe because applying a Yjs update
   * twice gives the same result. Updates added by other windows during compaction have a higher seq
   * and are not deleted.
   */
  async compact(threshold: number): Promise<number> {
    const candidates = await this.db.select<{ note_id: string }[]>(
      "SELECT note_id FROM note_doc_updates GROUP BY note_id HAVING COUNT(*) > $1",
      [threshold],
    );
    for (const { note_id: noteId } of candidates) {
      const [snapshots, updates] = await Promise.all([
        this.db.select<SnapshotRow[]>("SELECT snapshot FROM note_docs WHERE note_id = $1", [
          noteId,
        ]),
        this.db.select<UpdateRow[]>(
          "SELECT seq, data FROM note_doc_updates WHERE note_id = $1 ORDER BY seq",
          [noteId],
        ),
      ]);
      if (updates.length === 0) continue;
      const merged = Y.mergeUpdates(
        [...snapshots.map((s) => s.snapshot), ...updates.map((u) => u.data)].map(fromBase64),
      );
      const upto = updates[updates.length - 1].seq;
      await this.db.execute(
        `INSERT INTO note_docs (note_id, snapshot, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(note_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
        [noteId, toBase64(merged), Date.now()],
      );
      await this.db.execute("DELETE FROM note_doc_updates WHERE note_id = $1 AND seq <= $2", [
        noteId,
        upto,
      ]);
    }
    return candidates.length;
  }

  async remove(noteId: string): Promise<void> {
    await this.db.execute("DELETE FROM note_docs WHERE note_id = $1", [noteId]);
    await this.db.execute("DELETE FROM note_doc_updates WHERE note_id = $1", [noteId]);
  }
}
