import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MemoryDocStore } from "../data/local/memoryDocStore";
import { MemoryFolderRepository } from "../data/local/folderRepo";
import { MemoryNoteRepository } from "../data/local/memoryRepo";
import { BackupFormatError, BackupService, parseBackup } from "./backup";
import { DOC_FIELD } from "./editorSchema";
import { FolderService } from "./folderService";
import { docFromUpdates, plainTextFromDoc } from "./noteDoc";
import { NoteService } from "./noteService";
import { DEFAULT_SETTINGS } from "./settings";

/** One device: stores + services */
function device() {
  const notes = new MemoryNoteRepository();
  const docs = new MemoryDocStore();
  const folders = new MemoryFolderRepository();
  const service = new NoteService(notes, docs);
  return {
    notes,
    docs,
    service,
    folders: new FolderService(folders, service),
    backup: new BackupService(notes, docs, folders),
    /** As if a paragraph was typed in the editor */
    async type(noteId: string, text: string) {
      const doc = docFromUpdates(await docs.load(noteId));
      let update: Uint8Array | null = null;
      doc.on("update", (u: Uint8Array) => (update = u));
      const p = new Y.XmlElement("paragraph");
      p.insert(0, [new Y.XmlText(text)]);
      doc.getXmlFragment(DOC_FIELD).push([p]);
      await docs.append(noteId, update!, "local");
      await service.edit(noteId, { plainText: plainTextFromDoc(doc) });
    },
    async text(noteId: string) {
      return plainTextFromDoc(docFromUpdates(await docs.load(noteId)));
    },
  };
}

/** As if saved to a file and read back */
const roundTrip = (backup: object) => parseBackup(JSON.stringify(backup));

describe("BackupService", () => {
  it("restores notes, folders and settings on an empty device", async () => {
    const a = device();
    const work = (await a.folders.create("업무"))!;
    const note = await a.service.create("blue", work.id);
    await a.type(note.id, "회의 메모");
    await a.service.trash((await a.service.create()).id);

    const file = roundTrip(await a.backup.export({ ...DEFAULT_SETTINGS, theme: "dark" }));
    const b = device();
    const result = await b.backup.import(file);

    expect(result).toMatchObject({ created: 2, merged: 0, settings: { theme: "dark" } });
    expect(await b.text(note.id)).toBe("회의 메모");
    expect(await b.service.get(note.id)).toMatchObject({
      title: "회의 메모",
      color: "blue",
      folderId: work.id,
      spaceId: null,
    });
    expect(await b.service.list({ view: "trash" })).toHaveLength(1);
    expect((await b.folders.list()).map((f) => f.name)).toEqual(["업무"]);
  });

  it("merges into existing notes without duplicating, and keeps my settings for them", async () => {
    const a = device();
    const note = await a.service.create("yellow");
    await a.type(note.id, "첫 줄");
    const file = roundTrip(await a.backup.export(DEFAULT_SETTINGS));

    // kept writing after the backup and changed the color
    await a.type(note.id, "백업 뒤에 쓴 줄");
    await a.service.edit(note.id, { color: "pink" });

    const result = await a.backup.import(file);
    expect(result).toMatchObject({ created: 0, merged: 1 });
    expect(await a.text(note.id)).toBe("첫 줄\n백업 뒤에 쓴 줄");
    expect((await a.service.get(note.id))?.color).toBe("pink");

    // importing twice gives the same result
    await a.backup.import(file);
    expect(await a.text(note.id)).toBe("첫 줄\n백업 뒤에 쓴 줄");
  });

  it("maps folders with the same name to my existing folder", async () => {
    const a = device();
    const theirs = (await a.folders.create("업무"))!;
    await a.service.create("yellow", theirs.id);
    const file = roundTrip(await a.backup.export(DEFAULT_SETTINGS));

    const b = device();
    const mine = (await b.folders.create("업무"))!;
    await b.backup.import(file);
    expect(await b.folders.list()).toHaveLength(1);
    expect((await b.service.list({ view: "all" }))[0].folderId).toBe(mine.id);
  });

  it("drops reminders that are already past", async () => {
    const a = device();
    const past = await a.service.create();
    const future = await a.service.create();
    await a.service.setReminder(past.id, Date.now() - 1000);
    await a.service.setReminder(future.id, Date.now() + 60_000);
    const b = device();
    await b.backup.import(roundTrip(await a.backup.export(DEFAULT_SETTINGS)));
    expect((await b.service.get(past.id))?.remindAt).toBeNull();
    expect((await b.service.get(future.id))?.remindAt).not.toBeNull();
  });
});

describe("parseBackup", () => {
  const valid = {
    app: "urinote",
    format: 1,
    exportedAt: 1,
    settings: {},
    folders: [],
    notes: [],
  };

  it("rejects files that are not Urinote backups", () => {
    expect(() => parseBackup("not json")).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ ...valid, app: "other" }))).toThrow(
      /Urinote 백업 파일이 아닙니다/,
    );
    expect(() => parseBackup(JSON.stringify({ ...valid, format: 99 }))).toThrow(BackupFormatError);
  });

  it("rejects damaged notes and bogus document data", () => {
    const note = {
      id: "n1",
      folderId: null,
      color: "yellow",
      pinned: false,
      remindAt: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      plainText: "",
      doc: "",
    };
    expect(parseBackup(JSON.stringify({ ...valid, notes: [note] })).notes).toHaveLength(1);
    expect(() =>
      parseBackup(JSON.stringify({ ...valid, notes: [{ ...note, color: "neon" }] })),
    ).toThrow(/notes\[0\]/);
    expect(() =>
      parseBackup(JSON.stringify({ ...valid, notes: [{ ...note, id: "../../etc" }] })),
    ).toThrow(BackupFormatError);
    expect(() =>
      parseBackup(JSON.stringify({ ...valid, notes: [{ ...note, doc: "AAECAwQF" }] })),
    ).toThrow(/doc/);
  });
});
