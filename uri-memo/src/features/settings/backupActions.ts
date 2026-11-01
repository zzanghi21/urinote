import { openStores } from "../../data";
import { BackupService, backupFileName, parseBackup, type ImportResult } from "../../domain/backup";
import { emitDocUpdate, emitNoteChanged } from "../../platform/events";
import { openJsonFile, saveJsonFile } from "../../platform/files";
import { flushAllDocs } from "../notes/docSession";
import { flushPendingEdit } from "../notes/editorFlush";
import { useNotes } from "../notes/notesStore";
import { currentSettings, useSettings } from "./settingsStore";

const service = async () => {
  const { notes, docs, folders } = await openStores();
  return new BackupService(notes, docs, folders);
};

/** 백업 파일로 저장한다. 저장했으면 메모 수, 취소했으면 null */
export async function exportBackup(): Promise<number | null> {
  // 편집 중인 입력까지 담는다
  flushPendingEdit();
  await flushAllDocs();
  const backup = await (await service()).export(currentSettings());
  const saved = await saveJsonFile(backupFileName(Date.now()), JSON.stringify(backup, null, 2));
  return saved ? backup.notes.length : null;
}

/**
 * 백업 파일을 골라 합친다. 파일 형식이 틀리면 BackupFormatError.
 * confirm 이 false 를 돌려주거나 파일 선택을 취소하면 null
 */
export async function importBackup(
  confirm: (summary: { notes: number; folders: number }) => boolean,
): Promise<ImportResult | null> {
  const text = await openJsonFile();
  if (text === null) return null;
  const backup = parseBackup(text);
  if (!confirm({ notes: backup.notes.length, folders: backup.folders.length })) return null;

  flushPendingEdit();
  await flushAllDocs();
  const result = await (await service()).import(backup);
  useSettings.getState().replace(result.settings);
  // 열려 있는 편집기(Hub·스티키)에 합친 본문을 반영한다. 공유 메모면 친구에게도 전해진다
  for (const note of backup.notes) {
    if (note.doc) emitDocUpdate(note.id, note.doc, "import");
    emitNoteChanged(note.id);
  }
  await useNotes.getState().reloadAll();
  return result;
}
