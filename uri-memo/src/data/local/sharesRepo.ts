import type Database from "@tauri-apps/plugin-sql";
import type { Membership, SignedMembership } from "../../features/share/membership";

export type ShareStatus = "active" | "ended" | "left";

export interface ShareRecord {
  noteId: string;
  signed: SignedMembership;
  status: ShareStatus;
}

export interface OutboxItem {
  id: number;
  deviceId: string;
  noteId: string;
  kind: "offer" | "leave" | "offer-reply";
  payload: string;
}

export interface InboxItem {
  noteId: string;
  fromId: string;
  payload: string;
  receivedAt: number;
}

/** 공유 메모·받은 제안·보낼 메시지 (기기 안에만 저장) */
export interface SharesRepository {
  get(noteId: string): Promise<ShareRecord | null>;
  list(): Promise<ShareRecord[]>;
  save(record: ShareRecord): Promise<void>;
  remove(noteId: string): Promise<void>;

  inbox(): Promise<InboxItem[]>;
  putInbox(item: InboxItem): Promise<void>;
  removeInbox(noteId: string): Promise<void>;

  outboxFor(deviceId: string): Promise<OutboxItem[]>;
  enqueue(item: Omit<OutboxItem, "id">): Promise<void>;
  dequeue(id: number): Promise<void>;
  /** 같은 메모·기기·종류의 대기 메시지를 지운다 (예: 제안을 보내기 전에 멤버에서 빠진 경우) */
  dropQueued(deviceId: string, noteId: string, kind: OutboxItem["kind"]): Promise<void>;
}

interface ShareRow {
  note_id: string;
  membership: string;
  signature: string;
  status: ShareStatus;
}

export class SqliteSharesRepository implements SharesRepository {
  constructor(private readonly db: Database) {}

  private toRecord = (r: ShareRow): ShareRecord => ({
    noteId: r.note_id,
    signed: { membership: JSON.parse(r.membership) as Membership, signature: r.signature },
    status: r.status,
  });

  async get(noteId: string) {
    const rows = await this.db.select<ShareRow[]>("SELECT * FROM shares WHERE note_id = $1", [
      noteId,
    ]);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async list() {
    return (await this.db.select<ShareRow[]>("SELECT * FROM shares")).map(this.toRecord);
  }

  async save(r: ShareRecord) {
    const m = r.signed.membership;
    await this.db.execute(
      `INSERT INTO shares (note_id, owner_id, membership, signature, version, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(note_id) DO UPDATE SET owner_id = excluded.owner_id,
         membership = excluded.membership, signature = excluded.signature,
         version = excluded.version, status = excluded.status`,
      [r.noteId, m.owner, JSON.stringify(m), r.signed.signature, m.version, r.status],
    );
  }

  async remove(noteId: string) {
    await this.db.execute("DELETE FROM shares WHERE note_id = $1", [noteId]);
  }

  async inbox() {
    const rows = await this.db.select<
      { note_id: string; from_id: string; payload: string; received_at: number }[]
    >("SELECT * FROM share_inbox ORDER BY received_at");
    return rows.map((r) => ({
      noteId: r.note_id,
      fromId: r.from_id,
      payload: r.payload,
      receivedAt: r.received_at,
    }));
  }

  async putInbox(i: InboxItem) {
    await this.db.execute(
      `INSERT INTO share_inbox (note_id, from_id, payload, received_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT(note_id) DO UPDATE SET from_id = excluded.from_id, payload = excluded.payload,
         received_at = excluded.received_at`,
      [i.noteId, i.fromId, i.payload, i.receivedAt],
    );
  }

  async removeInbox(noteId: string) {
    await this.db.execute("DELETE FROM share_inbox WHERE note_id = $1", [noteId]);
  }

  async outboxFor(deviceId: string) {
    const rows = await this.db.select<
      {
        id: number;
        device_id: string;
        note_id: string;
        kind: OutboxItem["kind"];
        payload: string;
      }[]
    >("SELECT * FROM share_outbox WHERE device_id = $1 ORDER BY id", [deviceId]);
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      noteId: r.note_id,
      kind: r.kind,
      payload: r.payload,
    }));
  }

  async enqueue(i: Omit<OutboxItem, "id">) {
    await this.dropQueued(i.deviceId, i.noteId, i.kind);
    await this.db.execute(
      `INSERT INTO share_outbox (device_id, note_id, kind, payload, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [i.deviceId, i.noteId, i.kind, i.payload, Date.now()],
    );
  }

  async dequeue(id: number) {
    await this.db.execute("DELETE FROM share_outbox WHERE id = $1", [id]);
  }

  async dropQueued(deviceId: string, noteId: string, kind: OutboxItem["kind"]) {
    await this.db.execute(
      "DELETE FROM share_outbox WHERE device_id = $1 AND note_id = $2 AND kind = $3",
      [deviceId, noteId, kind],
    );
  }
}

/** 테스트용 */
export class MemorySharesRepository implements SharesRepository {
  private shares = new Map<string, ShareRecord>();
  private inboxItems = new Map<string, InboxItem>();
  private outbox: OutboxItem[] = [];
  private nextId = 1;

  async get(noteId: string) {
    return structuredClone(this.shares.get(noteId) ?? null);
  }
  async list() {
    return [...this.shares.values()].map((r) => structuredClone(r));
  }
  async save(r: ShareRecord) {
    this.shares.set(r.noteId, structuredClone(r));
  }
  async remove(noteId: string) {
    this.shares.delete(noteId);
  }
  async inbox() {
    return [...this.inboxItems.values()];
  }
  async putInbox(i: InboxItem) {
    this.inboxItems.set(i.noteId, i);
  }
  async removeInbox(noteId: string) {
    this.inboxItems.delete(noteId);
  }
  async outboxFor(deviceId: string) {
    return this.outbox.filter((o) => o.deviceId === deviceId);
  }
  async enqueue(i: Omit<OutboxItem, "id">) {
    await this.dropQueued(i.deviceId, i.noteId, i.kind);
    this.outbox.push({ ...i, id: this.nextId++ });
  }
  async dequeue(id: number) {
    this.outbox = this.outbox.filter((o) => o.id !== id);
  }
  async dropQueued(deviceId: string, noteId: string, kind: OutboxItem["kind"]) {
    this.outbox = this.outbox.filter(
      (o) => !(o.deviceId === deviceId && o.noteId === noteId && o.kind === kind),
    );
  }
}
