import { v7 as uuidv7 } from "uuid";

/** Note folders (F-07). Folders are a personal grouping on this device (shared notes too go into each person's own folders) */
export interface Folder {
  id: string;
  name: string;
  sort: number;
  createdAt: number;
  updatedAt: number;
}

export const FOLDER_NAME_MAX = 40;

export interface FolderRepository {
  /** In sort order */
  list(): Promise<Folder[]>;
  upsert(folder: Folder): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Trims whitespace and limits the length. null if empty */
export function cleanFolderName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, FOLDER_NAME_MAX);
  return trimmed === "" ? null : trimmed;
}

export function newFolder(name: string, sort: number, now = Date.now()): Folder {
  return { id: uuidv7(), name, sort, createdAt: now, updatedAt: now };
}

export const compareFolders = (a: Folder, b: Folder) =>
  a.sort - b.sort || a.name.localeCompare(b.name);
