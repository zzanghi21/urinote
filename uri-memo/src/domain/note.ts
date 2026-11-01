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
  /** 친구와 공유 중이면 공유 ID (= 메모 ID), 개인 메모면 null */
  spaceId: string | null;
  /** 본문 첫 줄에서 자동 생성 (목록·검색용) */
  title: string;
  /** TipTap JSON 문자열 */
  content: string;
  plainText: string;
  color: NoteColor;
  pinned: boolean;
  remindAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** 마지막으로 동기화한 서버 리비전 */
  rev: number;
  /** 서버에 아직 올리지 않은 변경이 있는지 */
  dirty: boolean;
}

export type NoteView = "all" | "pinned" | "trash";

export interface NoteFilter {
  view: NoteView;
  query?: string;
  /** 이 폴더의 메모만 (휴지통 보기에서는 무시). 없으면 모든 폴더 */
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

/** 제목 줄을 뺀 나머지 본문의 앞부분 (목록 미리보기) */
export function previewFromText(plainText: string, max = 120): string {
  const lines = plainText.split("\n").filter((line) => line.trim() !== "");
  return lines.slice(1).join(" ").slice(0, max);
}

/** 정렬: 휴지통은 삭제일 최신순, 그 외는 고정 우선 + 수정일 최신순 */
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
