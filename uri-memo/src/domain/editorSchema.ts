import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

/** Name of the body field in the Yjs document (Y.XmlFragment) */
export const DOC_FIELD = "content";

/**
 * Extensions in one place so the editor and the migration of old notes use the same schema.
 * Undo/redo is off because the Collaboration extension provides a Yjs-based one.
 */
export const baseExtensions = [
  StarterKit.configure({ undoRedo: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

export const noteSchema = getSchema(baseExtensions);
