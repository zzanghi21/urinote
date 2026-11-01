import { t } from "../i18n";
import * as Y from "yjs";
import type { DocStore } from "./docStore";
import { cleanFolderName, type Folder, type FolderRepository } from "./folder";
import { NOTE_COLORS, newNote, titleFromText, type Note, type NoteColor } from "./note";
import { docFromUpdates, fromBase64, plainTextFromDoc, toBase64 } from "./noteDoc";
import type { NoteRepository } from "./repository";
import { parseSettings, type Settings } from "./settings";

/**
 * JSON 내보내기·가져오기 (E-02).
 *
 * 파일에는 메모(본문 Yjs 상태 + 개인 설정), 폴더, 앱 설정을 담는다.
 * 친구 목록·공유 멤버·기기 키는 담지 않는다 (기기에 묶인 정보이고, 파일이 새면 친구인 척할 수 있으므로).
 *
 * 가져오기는 덮어쓰지 않고 합친다:
 * - 이미 있는 메모(같은 ID)는 본문만 Yjs 로 합치고, 색상·폴더 등 지금 기기의 설정은 그대로 둔다
 * - 없는 메모는 새로 만든다 (공유 표시는 붙이지 않는다: 개인 메모로 들어온다)
 * 같은 파일을 두 번 가져와도 내용이 겹치지 않는다.
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
  /** 읽기 쉽게 같이 넣는 본문 텍스트 (가져올 때는 doc 에서 다시 계산) */
  plainText: string;
  /** base64(Yjs 문서 전체 상태) */
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
          // 이미 지난 알림을 가져오면 한꺼번에 울리므로 버린다
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

  /** 파일의 폴더 ID → 내 기기의 폴더 ID. 같은 ID 나 같은 이름의 폴더가 있으면 그 폴더를 쓴다 */
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

/** 파일 내용을 검사한다. 형식이 틀리면 BackupFormatError */
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

/** 다른 프로그램이 만든 이상한 데이터가 문서 저장소에 들어가지 않게, 실제로 적용되는지 확인한다 */
function isYjsUpdate(update: Uint8Array) {
  try {
    Y.applyUpdate(new Y.Doc(), update);
    return true;
  } catch {
    return false;
  }
}

/** 파일 이름: urinote-backup-2026-11-01.json */
export function backupFileName(now: number) {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `urinote-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
