import { useEffect, useLayoutEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { Note } from "../../domain/note";
import type { NoteEdit } from "../../domain/noteService";
import { registerEditorFlush } from "./notesStore";

const SAVE_DEBOUNCE_MS = 500;

interface Props {
  note: Note;
  readOnly?: boolean;
  onSave(edit: NoteEdit): void;
}

function parseContent(content: string) {
  if (!content) return "";
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

const getPlainText = (editor: Editor) => editor.getText({ blockSeparator: "\n" });

/** 메모 1개를 편집한다. 메모가 바뀌면 key로 다시 마운트되는 것을 전제로 한다. */
export function NoteEditor({ note, readOnly = false, onSave }: Props) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<(() => void) | null>(null);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });

  const flush = () => {
    window.clearTimeout(timer.current);
    pending.current?.();
    pending.current = null;
  };

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
    content: parseContent(note.content),
    editable: !readOnly,
    autofocus: readOnly ? false : "end",
    editorProps: { attributes: { class: "note-editor-content", spellcheck: "false" } },
    onUpdate({ editor }) {
      pending.current = () =>
        onSaveRef.current({
          content: JSON.stringify(editor.getJSON()),
          plainText: getPlainText(editor),
        });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    onBlur: flush,
  });

  // 다른 메모로 전환하거나 창을 닫을 때 저장하지 않은 입력을 저장한다
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    const unregister = registerEditorFlush(flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      unregister();
      flush();
    };
  }, []);

  return (
    <div className="note-editor">
      <EditorContent editor={editor} className="note-editor-body" />
      {!readOnly && <Toolbar editor={editor} />}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      bullet: editor.isActive("bulletList"),
      task: editor.isActive("taskList"),
    }),
  });

  const chain = () => editor.chain().focus();
  const buttons = [
    { key: "bold", label: "B", title: "굵게 (Ctrl+B)", run: () => chain().toggleBold().run() },
    {
      key: "italic",
      label: "I",
      title: "기울임 (Ctrl+I)",
      run: () => chain().toggleItalic().run(),
    },
    {
      key: "underline",
      label: "U",
      title: "밑줄 (Ctrl+U)",
      run: () => chain().toggleUnderline().run(),
    },
    { key: "strike", label: "S", title: "취소선", run: () => chain().toggleStrike().run() },
    {
      key: "bullet",
      label: "•",
      title: "글머리 기호",
      run: () => chain().toggleBulletList().run(),
    },
    { key: "task", label: "☑", title: "체크리스트", run: () => chain().toggleTaskList().run() },
  ] as const;

  return (
    <div className="toolbar" role="toolbar" aria-label="서식">
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          className={`toolbar-btn toolbar-${b.key}${state[b.key] ? " active" : ""}`}
          title={b.title}
          aria-label={b.title}
          aria-pressed={state[b.key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
