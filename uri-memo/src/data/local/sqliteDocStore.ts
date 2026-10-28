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
   * 스냅샷을 먼저 쓰고 합친 로그를 지운다. 중간에 앱이 꺼져도 같은 업데이트가 스냅샷과 로그에
   * 함께 남을 뿐이고, Yjs 업데이트는 중복 적용해도 결과가 같으므로 안전하다.
   * 압축 중에 다른 창이 추가한 업데이트는 seq 가 더 크므로 지워지지 않는다.
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
