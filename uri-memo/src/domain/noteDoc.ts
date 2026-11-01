import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { DOC_FIELD, noteSchema } from "./editorSchema";

export function docFromUpdates(updates: Uint8Array[]): Y.Doc {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  return doc;
}

/** Converts a TipTap JSON body saved by M1/M2 into Yjs document state */
export function legacyContentToUpdate(json: string): Uint8Array | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const doc = prosemirrorJSONToYDoc(noteSchema, parsed, DOC_FIELD);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/**
 * Extracts text from a document without an editor (to refresh the list/search cache from remote changes).
 * Splits lines per text block to match the editor's getText({ blockSeparator: "\n" }).
 */
export function plainTextFromDoc(doc: Y.Doc): string {
  const lines: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlFragment) => {
    let line: string | null = null;
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) {
        line = (line ?? "") + deltaText(child);
      } else if (child instanceof Y.XmlElement) {
        if (child.nodeName === "hardBreak") line = (line ?? "") + "\n";
        else walk(child);
      }
    }
    if (line !== null || (node instanceof Y.XmlElement && node.length === 0))
      lines.push(line ?? "");
  };
  walk(doc.getXmlFragment(DOC_FIELD));
  return lines.join("\n");
}

function deltaText(text: Y.XmlText): string {
  return (text.toDelta() as { insert: unknown }[])
    .map((op) => (typeof op.insert === "string" ? op.insert : ""))
    .join("");
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
