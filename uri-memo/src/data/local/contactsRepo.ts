import type Database from "@tauri-apps/plugin-sql";

/** 확인 코드로 등록한 친구 기기 (기기 안에만 저장) */
export interface Contact {
  deviceId: string;
  name: string;
  pairedAt: number;
  lastSeen: number | null;
}

export interface ContactsRepository {
  list(): Promise<Contact[]>;
  upsert(contact: Contact): Promise<void>;
  rename(deviceId: string, name: string): Promise<void>;
  touch(deviceId: string, at: number): Promise<void>;
  remove(deviceId: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

interface Row {
  device_id: string;
  name: string;
  paired_at: number;
  last_seen: number | null;
}

export class SqliteContactsRepository implements ContactsRepository {
  constructor(private readonly db: Database) {}

  async list() {
    const rows = await this.db.select<Row[]>("SELECT * FROM contacts ORDER BY name");
    return rows.map((r) => ({
      deviceId: r.device_id,
      name: r.name,
      pairedAt: r.paired_at,
      lastSeen: r.last_seen,
    }));
  }

  async upsert(c: Contact) {
    await this.db.execute(
      `INSERT INTO contacts (device_id, name, paired_at, last_seen) VALUES ($1, $2, $3, $4)
       ON CONFLICT(device_id) DO UPDATE SET name = excluded.name, paired_at = excluded.paired_at`,
      [c.deviceId, c.name, c.pairedAt, c.lastSeen],
    );
  }

  async rename(deviceId: string, name: string) {
    await this.db.execute("UPDATE contacts SET name = $1 WHERE device_id = $2", [name, deviceId]);
  }

  async touch(deviceId: string, at: number) {
    await this.db.execute("UPDATE contacts SET last_seen = $1 WHERE device_id = $2", [
      at,
      deviceId,
    ]);
  }

  async remove(deviceId: string) {
    await this.db.execute("DELETE FROM contacts WHERE device_id = $1", [deviceId]);
  }

  /** 기기 이름 같은 작은 설정은 sync_state(키-값) 테이블에 둔다 */
  async getSetting(key: string) {
    const rows = await this.db.select<{ value: string }[]>(
      "SELECT value FROM sync_state WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string) {
    await this.db.execute(
      `INSERT INTO sync_state (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}
