import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDocStore } from "../data/local/memoryDocStore";
import { docFromUpdates, plainTextFromDoc } from "./noteDoc";
import { MemoryNoteRepository } from "../data/local/memoryRepo";
import { previewFromText, titleFromText, TRASH_RETENTION_MS } from "./note";
import { NoteService } from "./noteService";

describe("note helpers", () => {
  it("uses the first non-empty line as title", () => {
    expect(titleFromText("\n  장보기  \n우유\n계란")).toBe("장보기");
    expect(titleFromText("")).toBe("");
  });

  it("previews the lines after the title", () => {
    expect(previewFromText("장보기\n우유\n\n계란")).toBe("우유 계란");
  });
});

describe("NoteService", () => {
  let now: number;
  let service: NoteService;

  beforeEach(() => {
    now = 1_000_000;
    service = new NoteService(new MemoryNoteRepository(), new MemoryDocStore(), () => now);
  });

  it("creates and edits a note, deriving the title", async () => {
    const note = await service.create("blue");
    now += 10;
    const edited = await service.edit(note.id, { plainText: "회의 메모\n3분기 목표" });

    expect(edited).toMatchObject({
      title: "회의 메모",
      color: "blue",
      updatedAt: now,
      dirty: true,
    });
  });

  it("sorts pinned first, then most recently updated", async () => {
    const a = await service.create();
    now += 1;
    const b = await service.create();
    now += 1;
    const c = await service.create();
    now += 1;
    await service.edit(a.id, { pinned: true });

    const ids = (await service.list({ view: "all" })).map((n) => n.id);
    expect(ids).toEqual([a.id, c.id, b.id]);
    expect((await service.list({ view: "pinned" })).map((n) => n.id)).toEqual([a.id]);
  });

  it("moves notes to trash and restores them", async () => {
    const note = await service.edit((await service.create()).id, { pinned: true });
    await service.trash(note!.id);

    expect(await service.list({ view: "all" })).toHaveLength(0);
    const [trashed] = await service.list({ view: "trash" });
    expect(trashed).toMatchObject({ id: note!.id, pinned: false });

    await service.restore(note!.id);
    expect(await service.list({ view: "all" })).toHaveLength(1);
    expect(await service.list({ view: "trash" })).toHaveLength(0);
  });

  it("purges trash older than the retention period only", async () => {
    const old = await service.create();
    await service.trash(old.id);
    now += TRASH_RETENTION_MS / 2;
    const recent = await service.create();
    await service.trash(recent.id);

    now += TRASH_RETENTION_MS / 2 + 1;
    expect(await service.purgeExpiredTrash()).toBe(1);
    expect((await service.list({ view: "trash" })).map((n) => n.id)).toEqual([recent.id]);
  });

  it("searches title and body case-insensitively", async () => {
    const a = await service.create();
    await service.edit(a.id, { plainText: "Shopping\nmilk" });
    const b = await service.create();
    await service.edit(b.id, { plainText: "회의\n예산 검토" });

    expect((await service.list({ view: "all", query: "MILK" })).map((n) => n.id)).toEqual([a.id]);
    expect((await service.list({ view: "all", query: "예산" })).map((n) => n.id)).toEqual([b.id]);
  });

  it("discards a note left empty, but not one with pending text", async () => {
    const empty = await service.create();
    expect(await service.discardIfEmpty(empty.id)).toBe(true);
    expect(await service.get(empty.id)).toBeNull();

    const typed = await service.create();
    void service.edit(typed.id, { plainText: "방금 입력" });
    expect(await service.discardIfEmpty(typed.id)).toBe(false);
    expect(await service.get(typed.id)).not.toBeNull();
  });

  it("migrates legacy TipTap JSON into a Yjs doc exactly once", async () => {
    const repo = new MemoryNoteRepository();
    const docs = new MemoryDocStore();
    const svc = new NoteService(repo, docs, () => now);
    const note = await svc.create();
    const json = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "예전 메모" }] }],
    });
    await repo.upsert({ ...note, content: json, plainText: "예전 메모" });

    expect(await svc.migrateLegacyContent()).toBe(1);
    expect(await svc.migrateLegacyContent()).toBe(0);
    expect((await svc.get(note.id))?.content).toBe("");
    expect(plainTextFromDoc(docFromUpdates(await docs.load(note.id)))).toBe("예전 메모");
  });

  it("removes the document when an empty note is discarded or deleted", async () => {
    const docs = new MemoryDocStore();
    const svc = new NoteService(new MemoryNoteRepository(), docs, () => now);
    const empty = await svc.create();
    await docs.append(empty.id, new Uint8Array([0, 0]), "local");
    await svc.discardIfEmpty(empty.id);
    expect(await docs.load(empty.id)).toHaveLength(0);

    const kept = await svc.create();
    await svc.edit(kept.id, { plainText: "내용" });
    await docs.append(kept.id, new Uint8Array([0, 0]), "local");
    await svc.deleteForever(kept.id);
    expect(await docs.load(kept.id)).toHaveLength(0);
  });

  it("does not lose concurrent edits to the same note", async () => {
    const note = await service.create();
    await Promise.all([
      service.edit(note.id, { plainText: "내용" }),
      service.edit(note.id, { color: "pink" }),
      service.edit(note.id, { pinned: true }),
    ]);

    expect(await service.get(note.id)).toMatchObject({
      plainText: "내용",
      color: "pink",
      pinned: true,
    });
  });
});
