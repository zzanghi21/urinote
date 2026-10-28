import Database from "@tauri-apps/plugin-sql";
import { DB_URL } from "./sqliteRepo";

/** 기기별 스티키 창 상태 (서버와 동기화하지 않는다). 위치·크기는 논리 픽셀. */
export interface StickyWindowState {
  noteId: string;
  x: number | null;
  y: number | null;
  w: number;
  h: number;
  opacity: number;
  alwaysOnTop: boolean;
  collapsed: boolean;
  isOpen: boolean;
}

export const DEFAULT_STICKY_SIZE = { w: 300, h: 300 };

interface Row {
  note_id: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  opacity: number;
  always_on_top: number;
  collapsed: number;
  is_open: number;
}

const toState = (row: Row): StickyWindowState => ({
  noteId: row.note_id,
  x: row.x,
  y: row.y,
  w: row.w ?? DEFAULT_STICKY_SIZE.w,
  h: row.h ?? DEFAULT_STICKY_SIZE.h,
  opacity: row.opacity,
  alwaysOnTop: row.always_on_top === 1,
  collapsed: row.collapsed === 1,
  isOpen: row.is_open === 1,
});

export function defaultStickyState(noteId: string): StickyWindowState {
  return {
    noteId,
    x: null,
    y: null,
    ...DEFAULT_STICKY_SIZE,
    opacity: 1,
    alwaysOnTop: false,
    collapsed: false,
    isOpen: false,
  };
}

export class StickyWindowRepository {
  private constructor(private readonly db: Database) {}

  private static instance: Promise<StickyWindowRepository> | null = null;

  static open(): Promise<StickyWindowRepository> {
    StickyWindowRepository.instance ??= Database.load(DB_URL).then(
      (db) => new StickyWindowRepository(db),
    );
    return StickyWindowRepository.instance;
  }

  async get(noteId: string): Promise<StickyWindowState | null> {
    const rows = await this.db.select<Row[]>("SELECT * FROM sticky_windows WHERE note_id = $1", [
      noteId,
    ]);
    return rows[0] ? toState(rows[0]) : null;
  }

  /** 열려 있던 스티키 중 메모가 아직 휴지통에 없는 것 */
  async listOpen(): Promise<StickyWindowState[]> {
    const rows = await this.db.select<Row[]>(
      `SELECT s.* FROM sticky_windows s JOIN notes n ON n.id = s.note_id
       WHERE s.is_open = 1 AND n.deleted_at IS NULL`,
    );
    return rows.map(toState);
  }

  private queue: Promise<unknown> = Promise.resolve();

  /** 이동·크기 변경 저장이 겹쳐도 값이 유실되지 않도록 순서대로 실행한다 */
  update(noteId: string, patch: Partial<Omit<StickyWindowState, "noteId">>) {
    const run = () => this.write(noteId, patch);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async write(noteId: string, patch: Partial<Omit<StickyWindowState, "noteId">>) {
    const next = { ...((await this.get(noteId)) ?? defaultStickyState(noteId)), ...patch };
    await this.db.execute(
      `INSERT INTO sticky_windows (note_id, x, y, w, h, opacity, always_on_top, collapsed, is_open)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(note_id) DO UPDATE SET
         x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h,
         opacity = excluded.opacity, always_on_top = excluded.always_on_top,
         collapsed = excluded.collapsed, is_open = excluded.is_open`,
      [
        noteId,
        next.x,
        next.y,
        next.w,
        next.h,
        next.opacity,
        next.alwaysOnTop ? 1 : 0,
        next.collapsed ? 1 : 0,
        next.isOpen ? 1 : 0,
      ],
    );
    return next;
  }

  async remove(noteId: string) {
    await this.db.execute("DELETE FROM sticky_windows WHERE note_id = $1", [noteId]);
  }
}
