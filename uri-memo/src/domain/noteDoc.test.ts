import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MemoryDocStore } from "../data/local/memoryDocStore";
import { DOC_FIELD } from "./editorSchema";
import {
  docFromUpdates,
  fromBase64,
  legacyContentToUpdate,
  plainTextFromDoc,
  toBase64,
} from "./noteDoc";

const legacyJson = JSON.stringify({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "장보기" }] },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "우유" }] }],
        },
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "계란", marks: [{ type: "bold" }] }],
            },
          ],
        },
      ],
    },
  ],
});

/** 문서 맨 앞 문단 끝에 텍스트를 붙인다 (편집기 없이 사용자 입력을 흉내 낸다) */
function appendToFirstParagraph(doc: Y.Doc, text: string) {
  const paragraph = doc.getXmlFragment(DOC_FIELD).get(0) as Y.XmlElement;
  const xmlText = paragraph.get(0) as Y.XmlText;
  xmlText.insert(xmlText.length, text);
}

describe("noteDoc", () => {
  it("converts legacy TipTap JSON without losing text or structure", () => {
    const update = legacyContentToUpdate(legacyJson);
    expect(update).not.toBeNull();
    const doc = docFromUpdates([update!]);

    expect(plainTextFromDoc(doc)).toBe("장보기\n우유\n계란");
    const taskList = doc.getXmlFragment(DOC_FIELD).get(1) as Y.XmlElement;
    expect(taskList.nodeName).toBe("taskList");
    expect((taskList.get(1) as Y.XmlElement).getAttribute("checked")).toBe(true);
  });

  it("ignores empty or invalid legacy content", () => {
    expect(legacyContentToUpdate("")).toBeNull();
    expect(legacyContentToUpdate("not json")).toBeNull();
  });

  it("round-trips base64", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("merges concurrent offline edits from two windows/devices", () => {
    const base = legacyContentToUpdate(legacyJson)!;
    const a = docFromUpdates([base]);
    const b = docFromUpdates([base]);

    appendToFirstParagraph(a, " (A)");
    appendToFirstParagraph(b, " (B)");

    const fromA = Y.encodeStateAsUpdate(a);
    const fromB = Y.encodeStateAsUpdate(b);
    // 순서를 바꿔 적용하고, 중복으로 한 번 더 적용해도 결과가 같아야 한다
    Y.applyUpdate(a, fromB);
    Y.applyUpdate(b, fromA);
    Y.applyUpdate(b, fromA);

    const first = plainTextFromDoc(a).split("\n")[0];
    expect(first).toContain("(A)");
    expect(first).toContain("(B)");
    expect(plainTextFromDoc(a)).toBe(plainTextFromDoc(b));
  });
});

describe("MemoryDocStore", () => {
  it("keeps content after compaction and appends after it", async () => {
    const store = new MemoryDocStore();
    const doc = new Y.Doc();
    doc.on("update", (u: Uint8Array) => void store.append("n1", u, "local"));
    Y.applyUpdate(doc, legacyContentToUpdate(legacyJson)!);
    for (let i = 0; i < 5; i++) appendToFirstParagraph(doc, String(i));

    expect(await store.compact(3)).toBe(1);
    expect(await store.load("n1")).toHaveLength(1);
    appendToFirstParagraph(doc, "!");

    const restored = docFromUpdates(await store.load("n1"));
    expect(plainTextFromDoc(restored)).toBe(plainTextFromDoc(doc));
    expect(plainTextFromDoc(restored).startsWith("장보기01234!")).toBe(true);
  });
});
