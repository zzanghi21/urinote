import { create } from "zustand";
import type { Folder } from "../../domain/folder";
import type { FolderService } from "../../domain/folderService";
import type { Note, NoteColor, NoteView } from "../../domain/note";
import type { NoteEdit, NoteService } from "../../domain/noteService";
import { isDesktopApp } from "../../platform/env";
import { emitNoteChanged } from "../../platform/events";
import { currentSettings } from "../settings/settingsStore";
import { forgetSticky, isStickyOpen, openSticky } from "../../platform/stickyWindows";
import { flushPendingEdit } from "./editorFlush";

interface NotesState {
  service: NoteService | null;
  notes: Note[];
  view: NoteView;
  query: string;
  selectedId: string | null;
  ready: boolean;
  folders: Folder[];
  /** Folder shown in the list. null means all folders */
  folderId: string | null;

  /** selectFirst: open the first note right away in the two-pane (desktop) layout */
  init(service: NoteService, folders: FolderService, selectFirst?: boolean): Promise<void>;
  setView(view: NoteView): Promise<void>;
  setFolder(folderId: string | null): Promise<void>;
  /** Creates a folder and opens it */
  createFolder(name: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  moveToFolder(id: string, folderId: string | null): Promise<void>;
  /** Sets the reminder time (null clears it) */
  setReminder(id: string, remindAt: number | null): Promise<void>;
  /** Deletes only the folder (its notes go to "no folder") */
  deleteFolder(id: string): Promise<void>;
  /** Updates the query immediately and debounces the list query */
  setQuery(query: string): void;
  select(id: string | null): void;
  create(color?: NoteColor): Promise<void>;
  /** Creates a new note as a sticky window without changing the hub selection (tray, global shortcut) */
  createSticky(): Promise<void>;
  edit(id: string, edit: NoteEdit): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deleteForever(id: string): Promise<void>;
  refresh(): Promise<void>;
  /** When note metadata/cache changed in another window (sticky). docSession merges bodies live. */
  onExternalChange(): Promise<void>;
  /** Reloads all folders and notes (after an import) */
  reloadAll(): Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 150;

export const useNotes = create<NotesState>((set, get) => {
  let searchTimer: number | undefined;

  let folderService: FolderService | null = null;

  const service = () => {
    const s = get().service;
    if (!s) throw new Error("notes store not initialized");
    return s;
  };

  const reloadFolders = async () => {
    const folders = (await folderService?.list()) ?? [];
    // if the folder being viewed was deleted elsewhere, show all folders
    const folderId = folders.some((f) => f.id === get().folderId) ? get().folderId : null;
    set({ folders, folderId });
  };

  return {
    service: null,
    notes: [],
    view: "all",
    query: "",
    selectedId: null,
    ready: false,
    folders: [],
    folderId: null,

    async init(svc, folders, selectFirst = false) {
      set({ service: svc });
      folderService = folders;
      await svc.migrateLegacyContent();
      await svc.purgeExpiredTrash();
      await svc.compactDocs();
      await reloadFolders();
      await get().refresh();
      set({ ready: true, selectedId: selectFirst ? (get().notes[0]?.id ?? null) : null });
    },

    async refresh() {
      const { view, query, folderId } = get();
      const notes = await service().list({ view, query, folderId });
      set({ notes });
    },

    async setView(view) {
      leaveSelected();
      set({ view, selectedId: null });
      await get().refresh();
    },

    async setFolder(folderId) {
      if (folderId === get().folderId) return;
      leaveSelected();
      set({ folderId, selectedId: null });
      await get().refresh();
    },

    async createFolder(name) {
      const folder = await folderService?.create(name);
      if (!folder) return;
      await reloadFolders();
      if (get().view === "trash") set({ view: "all" });
      await get().setFolder(folder.id);
    },

    async renameFolder(id, name) {
      if (!(await folderService?.rename(id, name))) return;
      await reloadFolders();
    },

    async setReminder(id, remindAt) {
      await service().setReminder(id, remindAt);
      emitNoteChanged(id);
      await get().refresh();
    },

    async moveToFolder(id, folderId) {
      await service().edit(id, { folderId });
      emitNoteChanged(id);
      // the note would vanish from the folder being viewed, so follow it to its new folder
      const viewing = get().folderId;
      if (viewing !== null && viewing !== folderId) set({ folderId });
      await get().refresh();
    },

    async deleteFolder(id) {
      await folderService?.remove(id);
      await reloadFolders();
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
      // create it in the folder being viewed
      const note = await service().create(color ?? currentSettings().defaultColor, get().folderId);
      emitNoteChanged(note.id);
      window.clearTimeout(searchTimer);
      set({ view: "all", query: "", selectedId: note.id });
      await get().refresh();
    },

    async createSticky() {
      const note = await service().create(currentSettings().defaultColor);
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

    async reloadAll() {
      await reloadFolders();
      await get().refresh();
    },
  };

  /**
   * When leaving the selected note: save pending input first, then delete it if empty.
   * Notes open as sticky windows may be in use there, so they are not deleted.
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

  /** Selects the note below (or above) the one that left the list */
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
