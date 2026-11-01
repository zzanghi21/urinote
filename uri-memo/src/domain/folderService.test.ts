import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDocStore } from "../data/local/memoryDocStore";
import { MemoryFolderRepository } from "../data/local/folderRepo";
import { MemoryNoteRepository } from "../data/local/memoryRepo";
import { FolderService } from "./folderService";
import { NoteService } from "./noteService";
import { parseSettings } from "./settings";

describe("FolderService", () => {
  let notes: NoteService;
  let folders: FolderService;

  beforeEach(() => {
    notes = new NoteService(new MemoryNoteRepository(), new MemoryDocStore());
    folders = new FolderService(new MemoryFolderRepository(), notes);
  });

  it("creates folders in order, trimming names and reusing an existing name", async () => {
    const work = await folders.create("  업무  ");
    const home = await folders.create("개인");
    expect(await folders.create("업무")).toEqual(work);
    expect(await folders.create("   ")).toBeNull();
    expect((await folders.list()).map((f) => f.name)).toEqual(["업무", "개인"]);
    expect(home!.sort).toBeGreaterThan(work!.sort);
  });

  it("filters notes by folder, but not in the trash", async () => {
    const work = (await folders.create("업무"))!;
    const a = await notes.create("yellow", work.id);
    const b = await notes.create("yellow");
    expect((await notes.list({ view: "all", folderId: work.id })).map((n) => n.id)).toEqual([a.id]);
    expect(await notes.list({ view: "all" })).toHaveLength(2);

    await notes.trash(b.id);
    expect(await notes.list({ view: "trash", folderId: work.id })).toHaveLength(1);
  });

  it("deleting a folder keeps its notes, moving them to no folder", async () => {
    const work = (await folders.create("업무"))!;
    const note = await notes.create("yellow", work.id);
    await notes.trash((await notes.create("yellow", work.id)).id);

    await folders.remove(work.id);
    expect(await folders.list()).toEqual([]);
    expect((await notes.get(note.id))?.folderId).toBeNull();
    expect((await notes.list({ view: "trash" }))[0].folderId).toBeNull();
  });

  it("renames, ignoring empty names", async () => {
    const work = (await folders.create("업무"))!;
    expect(await folders.rename(work.id, "")).toBeNull();
    expect((await folders.rename(work.id, "회사"))?.name).toBe("회사");
  });
});

describe("parseSettings", () => {
  it("falls back to defaults for unknown or missing values", () => {
    expect(parseSettings({ theme: "dark", defaultColor: "blue", fontSize: "large" })).toEqual({
      theme: "dark",
      defaultColor: "blue",
      fontSize: "large",
    });
    expect(parseSettings({ theme: "neon", defaultColor: 3 })).toEqual({
      theme: "system",
      defaultColor: "yellow",
      fontSize: "medium",
    });
    expect(parseSettings(null).theme).toBe("system");
  });
});
