import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Selection } from "@tiptap/pm/state";
import { yXmlFragmentToProsemirrorJSON, ySyncPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { baseExtensions, DOC_FIELD } from "../../domain/editorSchema";
import type { NoteEdit } from "../../domain/noteService";
import { useT } from "../../i18n";
import { appKey } from "../../platform/shortcuts";
import { onAppEvent } from "../../platform/events";
import { acquireDoc, flushAllDocs } from "./docSession";
import { registerEditorFlush } from "./editorFlush";
import { openPresence, type PresenceHandle } from "./presenceSession";
import "./collab.css";

/** Save interval for the list/search text cache. docSession saves the body itself. */
const SAVE_DEBOUNCE_MS = 500;

interface Props {
  noteId: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** When shared with friends, shows each other's cursors and names */
  shared?: boolean;
  onSave(edit: NoteEdit): void;
}

interface Opened {
  doc: Y.Doc;
  presence: PresenceHandle | null;
}

/** Edits one note: opens its Yjs document, then shows the editor. */
export function NoteEditor({ noteId, shared = false, ...props }: Props) {
  const [opened, setOpened] = useState<Opened | null>(null);

  useEffect(() => {
    let close: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const handle = await acquireDoc(noteId);
      const presence = shared ? await openPresence(noteId, handle.doc).catch(() => null) : null;
      close = () => {
        presence?.close();
        handle.release();
      };
      if (cancelled) return close();
      setOpened({ doc: handle.doc, presence });
    })();
    return () => {
      cancelled = true;
      close?.();
    };
  }, [noteId, shared]);

  if (!opened) return <div className="note-editor" />;
  return (
    <CollabEditor
      key={`${opened.doc.guid}:${opened.presence?.awareness.clientID ?? ""}`}
      {...opened}
      {...props}
    />
  );
}

const getPlainText = (editor: Editor) => editor.getText({ blockSeparator: "\n" });

/**
 * Starts the editor with the same content as the Yjs document. Starting empty makes Collaboration
 * keep cursor position 1 when filling the content, which warns (TextSelection) for notes starting
 * with a checklist. Empty documents stay empty (writing an empty paragraph to Yjs could duplicate
 * blank lines when merging with friends' devices).
 */
function initialContent(doc: Y.Doc) {
  const fragment = doc.getXmlFragment(DOC_FIELD);
  return fragment.length > 0 ? yXmlFragmentToProsemirrorJSON(fragment) : undefined;
}

function caretElement(user: { name?: string; color?: string }) {
  const caret = document.createElement("span");
  caret.className = "collab-caret";
  caret.style.borderColor = user.color ?? "transparent";
  const label = document.createElement("span");
  label.className = "collab-caret-label";
  label.style.backgroundColor = user.color ?? "transparent";
  label.textContent = user.name ?? "";
  caret.append(label);
  return caret;
}

function CollabEditor({
  doc,
  presence,
  readOnly = false,
  autoFocus = true,
  onSave,
}: Omit<Props, "noteId" | "shared"> & Opened) {
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
    extensions: [
      ...baseExtensions,
      Collaboration.configure({ document: doc, field: DOC_FIELD }),
      ...(presence
        ? [
            CollaborationCaret.configure({
              provider: { awareness: presence.awareness },
              user: presence.user,
              render: caretElement,
            }),
          ]
        : []),
    ],
    content: initialContent(doc),
    editable: !readOnly,
    editorProps: { attributes: { class: "note-editor-content", spellcheck: "false" } },
    onCreate({ editor }) {
      if (readOnly || !autoFocus) return;
      // autofocus: "end" picks a position where you can't type in documents ending with a checklist
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(Selection.atEnd(state.doc)));
      view.focus();
    },
    onUpdate({ editor, transaction }) {
      // changes from other windows/devices update the cache on their side
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return;
      pending.current = () => onSaveRef.current({ plainText: getPlainText(editor) });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    onBlur: flush,
  });

  // save unsaved input when switching notes, closing the window or quitting
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
  const t = useT();
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
    {
      key: "bold",
      label: "B",
      title: t("굵게 ({key})", { key: appKey("B") }),
      run: () => chain().toggleBold().run(),
    },
    {
      key: "italic",
      label: "I",
      title: t("기울임 ({key})", { key: appKey("I") }),
      run: () => chain().toggleItalic().run(),
    },
    {
      key: "underline",
      label: "U",
      title: t("밑줄 ({key})", { key: appKey("U") }),
      run: () => chain().toggleUnderline().run(),
    },
    { key: "strike", label: "S", title: t("취소선"), run: () => chain().toggleStrike().run() },
    {
      key: "bullet",
      label: "•",
      title: t("글머리 기호"),
      run: () => chain().toggleBulletList().run(),
    },
    { key: "task", label: "☑", title: t("체크리스트"), run: () => chain().toggleTaskList().run() },
  ] as const;

  return (
    <div className="toolbar" role="toolbar" aria-label={t("서식")}>
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
