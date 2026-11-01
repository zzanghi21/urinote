import { v7 as uuidv7 } from "uuid";

/** 메모 폴더 (F-07). 폴더는 내 기기 안에서만 쓰는 개인 분류다 (공유 메모도 각자 폴더에 둔다) */
export interface Folder {
  id: string;
  name: string;
  sort: number;
  createdAt: number;
  updatedAt: number;
}

export const FOLDER_NAME_MAX = 40;

export interface FolderRepository {
  /** 정렬 순서대로 */
  list(): Promise<Folder[]>;
  upsert(folder: Folder): Promise<void>;
  remove(id: string): Promise<void>;
}

/** 앞뒤 공백을 지우고 길이를 자른다. 비어 있으면 null */
export function cleanFolderName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, FOLDER_NAME_MAX);
  return trimmed === "" ? null : trimmed;
}

export function newFolder(name: string, sort: number, now = Date.now()): Folder {
  return { id: uuidv7(), name, sort, createdAt: now, updatedAt: now };
}

export const compareFolders = (a: Folder, b: Folder) =>
  a.sort - b.sort || a.name.localeCompare(b.name);
