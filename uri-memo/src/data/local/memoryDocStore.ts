import * as Y from "yjs";
import type { DocStore, DocUpdateOrigin } from "../../domain/docStore";
import { fromBase64, toBase64 } from "../../domain/noteDoc";

interface Entry {
  snapshot: Uint8Array | null;
  updates: Uint8Array[];
}

/** For tests and the browser preview. With a localStorage key it survives reloads. */
export class MemoryDocStore implements DocStore {
  private docs = new Map<string, Entry>();

  constructor(private readonly storageKey?: string) {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        for (const [id, parts] of Object.entries(JSON.parse(saved) as Record<string, string[]>)) {
          this.docs.set(id, { snapshot: null, updates: parts.map(fromBase64) });
        }
      }
    }
  }

  async load(noteId: string): Promise<Uint8Array[]> {
    const entry = this.docs.get(noteId);
    if (!entry) return [];
    return entry.snapshot ? [entry.snapshot, ...entry.updates] : [...entry.updates];
  }

  /** The in-memory store never uploads, so it ignores the origin */
  async append(noteId: string, update: Uint8Array, _origin?: DocUpdateOrigin): Promise<void> {
    const entry = this.docs.get(noteId) ?? { snapshot: null, updates: [] };
    entry.updates.push(update);
    this.docs.set(noteId, entry);
    this.persist();
  }

  async compact(threshold: number): Promise<number> {
    let count = 0;
    for (const entry of this.docs.values()) {
      if (entry.updates.length <= threshold) continue;
      const parts = entry.snapshot ? [entry.snapshot, ...entry.updates] : entry.updates;
      entry.snapshot = Y.mergeUpdates(parts);
      entry.updates = [];
      count++;
    }
    if (count) this.persist();
    return count;
  }

  async remove(noteId: string): Promise<void> {
    this.docs.delete(noteId);
    this.persist();
  }

  private persist() {
    if (!this.storageKey || typeof localStorage === "undefined") return;
    const out: Record<string, string[]> = {};
    for (const [id, entry] of this.docs) {
      const parts = entry.snapshot ? [entry.snapshot, ...entry.updates] : entry.updates;
      out[id] = parts.map(toBase64);
    }
    localStorage.setItem(this.storageKey, JSON.stringify(out));
  }
}
