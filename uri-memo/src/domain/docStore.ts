export type DocUpdateOrigin = "local" | "remote";

/** Store for note bodies (Yjs documents): one snapshot + an append-only update log. */
export interface DocStore {
  /** Updates that rebuild the document (snapshot, then log). Empty if there is no document */
  load(noteId: string): Promise<Uint8Array[]>;
  append(noteId: string, update: Uint8Array, origin: DocUpdateOrigin): Promise<void>;
  /** Merges documents whose log exceeds threshold into the snapshot. Returns how many were merged */
  compact(threshold: number): Promise<number>;
  remove(noteId: string): Promise<void>;
}
