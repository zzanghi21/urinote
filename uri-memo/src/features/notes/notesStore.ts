import { create } from "zustand";
import type { Note, NoteColor, NoteView } from "../../domain/note";
import type { NoteEdit, NoteService } from "../../domain/noteService";
import { isDesktopApp } from "../../platform/env";
import { emitNoteChanged } from "../../platform/events";
import { forgetSticky, isStickyOpen, openSticky } from "../../platform/stickyWindows";
import { flushPendingEdit } from "./editorFlush";

interface NotesState {
  service: NoteService | null;
  notes: Note[];
  view: NoteView;
  query: string;
  selectedId: string | null;
  ready: boolean;

  /** selectFirst: 2단 화면(데스크톱)에서 첫 메모를 바로 연다 */
  init(service: NoteService, selectFirst?: boolean): Promise<void>;
  setView(view: NoteView): Promise<void>;
  /** 검색어는 바로 반영하고 목록 조회는 디바운스한다 */
  setQuery(query: string): void;
  select(id: string | null): void;
  create(color?: NoteColor): Promise<void>;
  /** Hub 선택은 그대로 두고 새 메모를 스티키 창으로 만든다 (트레이·전역 단축키) */
  createSticky(): Promise<void>;
  edit(id: string, edit: NoteEdit): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deleteForever(id: string): Promise<void>;
  refresh(): Promise<void>;
  /** 다른 창(스티키)에서 메모 메타데이터·캐시가 바뀌었을 때. 본문은 docSession 이 실시간 병합한다. */
  onExternalChange(): Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 150;

export const useNotes = create<NotesState>((set, get) => {
  let searchTimer: number | undefined;

  const service = () => {
    const s = get().service;
    if (!s) throw new Error("notes store not initialized");
    return s;
  };

  return {
    service: null,
    notes: [],
    view: "all",
    query: "",
    selectedId: null,
    ready: false,

    async init(svc, selectFirst = false) {
      set({ service: svc });
      await svc.migrateLegacyContent();
      await svc.purgeExpiredTrash();
      await svc.compactDocs();
      await get().refresh();
      set({ ready: true, selectedId: selectFirst ? (get().notes[0]?.id ?? null) : null });
    },

    async refresh() {
      const { view, query } = get();
      const notes = await service().list({ view, query });
      set({ notes });
    },

    async setView(view) {
      leaveSelected();
      set({ view, selectedId: null });
      await get().refresh();
    },

    setQuery(query) {
      set({ query });
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => void get().refresh(), SEARCH_DEBOUNCE_MS);
    },

    select(id) {
      if (id !== get().selectedId) leaveSelected();
      set({ selectedId: id });
    },

    async create(color) {
      leaveSelected();
      const note = await service().create(color);
      emitNoteChanged(note.id);
      window.clearTimeout(searchTimer);
      set({ view: "all", query: "", selectedId: note.id });
      await get().refresh();
    },

    async createSticky() {
      const note = await service().create();
      emitNoteChanged(note.id);
      await get().refresh();
      await openSticky(note.id, { at: "cursor" });
    },

    async edit(id, edit) {
      await service().edit(id, edit);
      emitNoteChanged(id);
      await get().refresh();
    },

    async trash(id) {
      await service().trash(id);
      emitNoteChanged(id);
      await afterRemoval(id);
    },

    async restore(id) {
      await service().restore(id);
      emitNoteChanged(id);
      await afterRemoval(id);
    },

    async deleteForever(id) {
      await service().deleteForever(id);
      if (isDesktopApp) await forgetSticky(id);
      emitNoteChanged(id);
      await afterRemoval(id);
    },

    async onExternalChange() {
      await get().refresh();
    },
  };

  /**
   * 선택 중인 메모를 떠날 때: 저장 대기 중인 입력을 먼저 저장하고, 비어 있으면 지운다.
   * 스티키 창으로 열려 있는 메모는 그 창에서 쓰는 중일 수 있으므로 지우지 않는다.
   */
  function leaveSelected() {
    const id = get().selectedId;
    if (!id) return;
    flushPendingEdit();
    void (async () => {
      if (isDesktopApp && (await isStickyOpen(id))) return;
      if (await service().discardIfEmpty(id)) {
        emitNoteChanged(id);
        await get().refresh();
      }
    })();
  }

  /** 현재 목록에서 사라진 메모 대신 바로 아래(없으면 위) 메모를 선택한다 */
  async function afterRemoval(id: string) {
    const before = get().notes;
    const index = before.findIndex((n) => n.id === id);
    await get().refresh();
    const after = get().notes;
    const next = after[Math.min(Math.max(index, 0), after.length - 1)];
    set({ selectedId: next?.id ?? null });
  }
});

export const useSelectedNote = () =>
  useNotes((s) => s.notes.find((n) => n.id === s.selectedId) ?? null);
