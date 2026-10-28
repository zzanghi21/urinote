import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Selection } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { baseExtensions, DOC_FIELD } from "../../domain/editorSchema";
import type { NoteEdit } from "../../domain/noteService";
import { onAppEvent } from "../../platform/events";
import { acquireDoc, flushAllDocs } from "./docSession";
import { registerEditorFlush } from "./editorFlush";

/** 목록·검색용 텍스트 캐시 저장 간격. 본문 자체는 docSession 이 따로 저장한다. */
const SAVE_DEBOUNCE_MS = 500;

interface Props {
  noteId: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  onSave(edit: NoteEdit): void;
}

/** 메모 1개를 편집한다. 메모의 Yjs 문서를 연 뒤 편집기를 띄운다. */
export function NoteEditor({ noteId, ...props }: Props) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);

  useEffect(() => {
    let release: (() => void) | null = null;
    let cancelled = false;
    void acquireDoc(noteId).then((handle) => {
      if (cancelled) return handle.release();
      release = handle.release;
      setDoc(handle.doc);
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [noteId]);

  if (!doc) return <div className="note-editor" />;
  return <CollabEditor key={doc.guid} doc={doc} {...props} />;
}

const getPlainText = (editor: Editor) => editor.getText({ blockSeparator: "\n" });

function CollabEditor({
  doc,
  readOnly = false,
  autoFocus = true,
  onSave,
}: Omit<Props, "noteId"> & { doc: Y.Doc }) {
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
    extensions: [...baseExtensions, Collaboration.configure({ document: doc, field: DOC_FIELD })],
    editable: !readOnly,
    editorProps: { attributes: { class: "note-editor-content", spellcheck: "false" } },
    onCreate({ editor }) {
      if (readOnly || !autoFocus) return;
      // autofocus: "end" 는 체크리스트로 끝나는 문서에서 글자를 넣을 수 없는 위치를 고른다
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(Selection.atEnd(state.doc)));
      view.focus();
    },
    onUpdate({ editor, transaction }) {
      // 다른 창·기기에서 온 변경은 그쪽이 캐시를 갱신한다
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return;
      pending.current = () => onSaveRef.current({ plainText: getPlainText(editor) });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    onBlur: flush,
  });

  // 다른 메모로 전환하거나 창을 닫거나 앱을 종료할 때 저장하지 않은 입력을 저장한다
  useEffect(() => {
    const flushAll = () => {
      flush();
      void flushAllDocs();
    };
    window.addEventListener("beforeunload", flushAll);
    const unregister = registerEditorFlush(flush);
    const unlistenQuit = onAppEvent("app://flush", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      unregister();
      unlistenQuit();
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
