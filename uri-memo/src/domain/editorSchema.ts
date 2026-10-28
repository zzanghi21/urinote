import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

/** Yjs 문서의 본문 필드 이름 (Y.XmlFragment) */
export const DOC_FIELD = "content";

/**
 * 편집기와 기존 메모 변환이 같은 스키마를 쓰도록 확장 목록을 한곳에 둔다.
 * Undo/Redo 는 Collaboration 확장이 Yjs 기반으로 제공하므로 끈다.
 */
export const baseExtensions = [
  StarterKit.configure({ undoRedo: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

export const noteSchema = getSchema(baseExtensions);
