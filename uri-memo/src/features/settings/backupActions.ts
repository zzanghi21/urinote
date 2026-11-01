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

/** Saves a backup file. Returns the note count, or null if cancelled */
export async function exportBackup(): Promise<number | null> {
  // include input still being edited
  flushPendingEdit();
  await flushAllDocs();
  const backup = await (await service()).export(currentSettings());
  const saved = await saveJsonFile(backupFileName(Date.now()), JSON.stringify(backup, null, 2));
  return saved ? backup.notes.length : null;
}

/**
 * Picks a backup file and merges it. Throws BackupFormatError if the format is wrong.
 * Returns null if confirm returns false or the file picker is cancelled.
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
  // apply merged bodies to open editors (hub and stickies); shared notes also reach friends
  for (const note of backup.notes) {
    if (note.doc) emitDocUpdate(note.id, note.doc, "import");
    emitNoteChanged(note.id);
  }
  await useNotes.getState().reloadAll();
  return result;
}
