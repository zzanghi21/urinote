import { v7 as uuidv7 } from "uuid";

export const NOTE_COLORS = [
  "yellow",
  "green",
  "pink",
  "purple",
  "blue",
  "gray",
  "charcoal",
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TITLE_MAX = 100;

export interface Note {
  id: string;
  folderId: string | null;
  /** Share ID (= note ID) when shared with friends, null for personal notes */
  spaceId: string | null;
  /** Derived from the first line of the body (for the list and search) */
  title: string;
  /** TipTap JSON string */
  content: string;
  plainText: string;
  color: NoteColor;
  pinned: boolean;
  remindAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Last synced server revision */
  rev: number;
  /** Whether there are changes not yet uploaded to the server */
  dirty: boolean;
}

export type NoteView = "all" | "pinned" | "trash";

export interface NoteFilter {
  view: NoteView;
  query?: string;
  /** Only notes in this folder (ignored in the trash view). All folders if absent */
  folderId?: string | null;
}

export function newNote(overrides: Partial<Note> = {}, now = Date.now()): Note {
  return {
    id: uuidv7(),
    folderId: null,
    spaceId: null,
    title: "",
    content: "",
    plainText: "",
    color: "yellow",
    pinned: false,
    remindAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 0,
    dirty: true,
    ...overrides,
  };
}

export function titleFromText(plainText: string): string {
  const firstLine = plainText.split("\n").find((line) => line.trim() !== "") ?? "";
  return firstLine.trim().slice(0, TITLE_MAX);
}

/** Start of the body after the title line (list preview) */
export function previewFromText(plainText: string, max = 120): string {
  const lines = plainText.split("\n").filter((line) => line.trim() !== "");
  return lines.slice(1).join(" ").slice(0, max);
}

/** Sorting: trash by newest deletion; otherwise pinned first, then newest modification */
export function compareNotes(view: NoteView) {
  return (a: Note, b: Note): number => {
    if (view === "trash") return (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  };
}

export function matchesFilter(note: Note, filter: NoteFilter): boolean {
  if (filter.view === "trash") {
    if (note.deletedAt === null) return false;
  } else {
    if (note.deletedAt !== null) return false;
    if (filter.view === "pinned" && !note.pinned) return false;
    if (filter.folderId && note.folderId !== filter.folderId) return false;
  }
  const query = filter.query?.trim().toLowerCase();
  if (!query) return true;
  return note.title.toLowerCase().includes(query) || note.plainText.toLowerCase().includes(query);
}
