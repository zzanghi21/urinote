export type DocUpdateOrigin = "local" | "remote";

/** 메모 본문(Yjs 문서) 저장소. 스냅샷 1개 + 추가 전용 업데이트 로그. */
export interface DocStore {
  /** 문서를 복원할 업데이트 목록 (스냅샷 → 로그 순). 문서가 없으면 빈 배열 */
  load(noteId: string): Promise<Uint8Array[]>;
  append(noteId: string, update: Uint8Array, origin: DocUpdateOrigin): Promise<void>;
  /** 로그가 threshold 건을 넘는 문서를 스냅샷으로 합친다. 합친 문서 수를 반환 */
  compact(threshold: number): Promise<number>;
  remove(noteId: string): Promise<void>;
}
