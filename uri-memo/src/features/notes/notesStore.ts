import { create } from "zustand";
import type { Note, NoteColor, NoteView } from "../../domain/note";
import type { NoteEdit, NoteService } from "../../domain/noteService";

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
  edit(id: string, edit: NoteEdit): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deleteForever(id: string): Promise<void>;
  refresh(): Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 150;

let flushEditor: (() => void) | null = null;

/** 열린 편집기가 저장 대기 중인 입력을 즉시 저장하는 함수를 등록한다. 해제 함수를 반환한다. */
export function registerEditorFlush(flush: () => void) {
  flushEditor = flush;
  return () => {
    if (flushEditor === flush) flushEditor = null;
  };
}

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
      await svc.purgeExpiredTrash();
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
      window.clearTimeout(searchTimer);
      set({ view: "all", query: "", selectedId: note.id });
      await get().refresh();
    },

    async edit(id, edit) {
      await service().edit(id, edit);
      await get().refresh();
    },

    async trash(id) {
      await service().trash(id);
      await afterRemoval(id);
    },

    async restore(id) {
      await service().restore(id);
      await afterRemoval(id);
    },

    async deleteForever(id) {
      await service().deleteForever(id);
      await afterRemoval(id);
    },
  };

  /** 선택 중인 메모를 떠날 때: 저장 대기 중인 입력을 먼저 저장하고, 비어 있으면 지운다 */
  function leaveSelected() {
    const id = get().selectedId;
    if (!id) return;
    flushEditor?.();
    void service()
      .discardIfEmpty(id)
      .then((discarded) => (discarded ? get().refresh() : undefined));
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
