import { t } from "../i18n";
import * as Y from "yjs";
import type { DocStore } from "./docStore";
import { cleanFolderName, type Folder, type FolderRepository } from "./folder";
import { NOTE_COLORS, newNote, titleFromText, type Note, type NoteColor } from "./note";
import { docFromUpdates, fromBase64, plainTextFromDoc, toBase64 } from "./noteDoc";
import type { NoteRepository } from "./repository";
import { parseSettings, type Settings } from "./settings";

/**
 * JSON export / import (E-02).
 *
 * The file holds notes (Yjs body state + personal settings), folders and app settings.
 * Friends, share members and device keys are not included (they are tied to the device, and a
 * leaked file could be used to pose as a friend).
 *
 * Import merges instead of overwriting:
 * - existing notes (same ID) merge only their body via Yjs; this device's color, folder etc. stay
 * - missing notes are created (without the shared mark: they arrive as personal notes)
 * Importing the same file twice does not duplicate anything.
 */

export const BACKUP_APP = "urinote";
export const BACKUP_FORMAT = 1;

export interface BackupNote {
  id: string;
  folderId: string | null;
  color: NoteColor;
  pinned: boolean;
  remindAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Body text included for readability (recomputed from doc on import) */
  plainText: string;
  /** base64(full Yjs document state) */
  doc: string;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: number;
  settings: Settings;
  folders: Pick<Folder, "id" | "name" | "sort">[];
  notes: BackupNote[];
}

export interface ImportResult {
  created: number;
  merged: number;
  folders: number;
  settings: Settings;
}

const MAX_NOTES = 100_000;
const MAX_FOLDERS = 1_000;

export class BackupService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly docs: DocStore,
    private readonly folders: FolderRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async export(settings: Settings): Promise<BackupFile> {
    const all = [
      ...(await this.notes.list({ view: "all" })),
      ...(await this.notes.list({ view: "trash" })),
    ];
    const notes: BackupNote[] = [];
    for (const n of all) {
      const updates = await this.docs.load(n.id);
      notes.push({
        id: n.id,
        folderId: n.folderId,
        color: n.color,
        pinned: n.pinned,
        remindAt: n.remindAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        deletedAt: n.deletedAt,
        plainText: n.plainText,
        doc: toBase64(updates.length > 0 ? Y.mergeUpdates(updates) : new Uint8Array()),
      });
    }
    return {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: this.now(),
      settings,
      folders: (await this.folders.list()).map(({ id, name, sort }) => ({ id, name, sort })),
      notes,
    };
  }

  async import(backup: BackupFile): Promise<ImportResult> {
    const folderIds = await this.importFolders(backup.folders);
    let created = 0;
    let merged = 0;
    for (const b of backup.notes) {
      const update = fromBase64(b.doc);
      if (update.length > 0) await this.docs.append(b.id, update, "local");
      const plainText = plainTextFromDoc(docFromUpdates(await this.docs.load(b.id)));
      const existing = await this.notes.get(b.id);
      if (existing) {
        await this.notes.upsert({ ...existing, plainText, title: titleFromText(plainText) });
        merged++;
        continue;
      }
      const note: Note = newNote(
        {
          id: b.id,
          folderId: b.folderId ? (folderIds.get(b.folderId) ?? null) : null,
          color: b.color,
          pinned: b.pinned,
          // past reminders would all fire at once, so drop them
          remindAt: b.remindAt !== null && b.remindAt > this.now() ? b.remindAt : null,
          createdAt: b.createdAt,
          deletedAt: b.deletedAt,
          plainText,
          title: titleFromText(plainText),
        },
        b.updatedAt,
      );
      await this.notes.upsert(note);
      created++;
    }
    return { created, merged, folders: folderIds.size, settings: backup.settings };
  }

  /** Folder ID in the file → folder ID on this device. Reuses a folder with the same ID or name */
  private async importFolders(folders: BackupFile["folders"]) {
    const mine = await this.folders.list();
    const map = new Map<string, string>();
    let sort = Math.max(0, ...mine.map((f) => f.sort));
    for (const f of folders) {
      const same =
        mine.find((m) => m.id === f.id) ??
        mine.find((m) => m.name.toLowerCase() === f.name.toLowerCase());
      if (same) {
        map.set(f.id, same.id);
        continue;
      }
      const now = this.now();
      const folder: Folder = {
        id: f.id,
        name: f.name,
        sort: ++sort,
        createdAt: now,
        updatedAt: now,
      };
      await this.folders.upsert(folder);
      mine.push(folder);
      map.set(f.id, f.id);
    }
    return map;
  }
}

export class BackupFormatError extends Error {}

/** Validates the file contents. Throws BackupFormatError if the format is wrong */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError(t("JSON 파일이 아닙니다"));
  }
  const r = obj(raw);
  if (r.app !== BACKUP_APP) throw new BackupFormatError(t("Urinote 백업 파일이 아닙니다"));
  if (r.format !== BACKUP_FORMAT) {
    throw new BackupFormatError(t("이 버전의 Urinote 에서 읽을 수 없는 백업 형식입니다"));
  }
  if (!Array.isArray(r.notes) || r.notes.length > MAX_NOTES) throw bad("notes");
  if (!Array.isArray(r.folders) || r.folders.length > MAX_FOLDERS) throw bad("folders");

  const folders = r.folders.map((f, i) => {
    const o = obj(f);
    const name = typeof o.name === "string" ? cleanFolderName(o.name) : null;
    if (!isId(o.id) || !name) throw bad(`folders[${i}]`);
    return { id: o.id, name, sort: Number.isSafeInteger(o.sort) ? (o.sort as number) : 0 };
  });

  const notes = r.notes.map((n, i): BackupNote => {
    const o = obj(n);
    const ok =
      isId(o.id) &&
      (o.folderId === null || isId(o.folderId)) &&
      (NOTE_COLORS as readonly unknown[]).includes(o.color) &&
      typeof o.pinned === "boolean" &&
      isTime(o.createdAt) &&
      isTime(o.updatedAt) &&
      (o.remindAt === null || isTime(o.remindAt)) &&
      (o.deletedAt === null || isTime(o.deletedAt)) &&
      typeof o.doc === "string" &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(o.doc);
    if (!ok) throw bad(`notes[${i}]`);
    const doc = o.doc as string;
    if (doc.length > 0 && !isYjsUpdate(fromBase64(doc))) throw bad(`notes[${i}].doc`);
    return {
      id: o.id as string,
      folderId: o.folderId as string | null,
      color: o.color as NoteColor,
      pinned: o.pinned as boolean,
      remindAt: o.remindAt as number | null,
      createdAt: o.createdAt as number,
      updatedAt: o.updatedAt as number,
      deletedAt: o.deletedAt as number | null,
      plainText: typeof o.plainText === "string" ? o.plainText : "",
      doc,
    };
  });

  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: isTime(r.exportedAt) ? r.exportedAt : 0,
    settings: parseSettings(r.settings),
    folders,
    notes,
  };
}

const obj = (v: unknown) =>
  (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
const isId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9-]+$/.test(v);
const isTime = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const bad = (where: string) =>
  new BackupFormatError(t("백업 파일이 손상되었습니다 ({where})", { where }));

/** Checks the update actually applies, so odd data from other programs never reaches the document store */
function isYjsUpdate(update: Uint8Array) {
  try {
    Y.applyUpdate(new Y.Doc(), update);
    return true;
  } catch {
    return false;
  }
}

/** File name: urinote-backup-2026-11-01.json */
export function backupFileName(now: number) {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `urinote-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
