import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { ColorPicker } from "../../components/ColorPicker";
import { openStores } from "../../data";
import {
  defaultStickyState,
  StickyWindowRepository,
  type StickyWindowState,
} from "../../data/local/stickyWindowRepo";
import type { Note } from "../../domain/note";
import { NoteService, type NoteEdit } from "../../domain/noteService";
import { formatReminder } from "../../domain/reminder";
import { useT } from "../../i18n";
import { appKey } from "../../platform/shortcuts";
import { ReminderFields } from "../reminders/ReminderPicker";
import { emitNoteChanged, onNoteChangedElsewhere } from "../../platform/events";
import { openSticky, showHub, STICKY_COLLAPSED_HEIGHT } from "../../platform/stickyWindows";
import { flushAllDocs } from "../notes/docSession";
import { flushPendingEdit } from "../notes/editorFlush";
import { shareAccess, type ShareAccess } from "../share/viewOnly";
import { NoteEditor } from "../notes/NoteEditor";
import "./sticky.css";

const SAVE_BOUNDS_DEBOUNCE_MS = 300;
const NEW_STICKY_OFFSET = 30;

type WindowPatch = Partial<Omit<StickyWindowState, "noteId">>;

const appWindow = getCurrentWindow();
const stickyRepo = () => StickyWindowRepository.open();

/** One note pinned to the desktop = one window */
export function StickyApp({ noteId }: { noteId: string }) {
  const t = useT();
  const [service, setService] = useState<NoteService | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [win, setWin] = useState<StickyWindowState>(() => defaultStickyState(noteId));
  const [menuOpen, setMenuOpen] = useState(false);
  const [access, setAccess] = useState<ShareAccess>({ shared: false, viewOnly: false });
  const { viewOnly } = access;
  const collapsed = useRef(false);

  const updateWindow = (patch: WindowPatch) => {
    if (patch.collapsed !== undefined) collapsed.current = patch.collapsed;
    setWin((prev) => ({ ...prev, ...patch }));
    void stickyRepo().then((repo) => repo.update(noteId, patch));
  };

  useEffect(() => {
    void (async () => {
      const stores = await openStores();
      const svc = new NoteService(stores.notes, stores.docs);
      const loaded = await svc.get(noteId);
      if (!loaded || loaded.deletedAt !== null) {
        await appWindow.close();
        return;
      }
      const state = (await (await stickyRepo()).get(noteId)) ?? defaultStickyState(noteId);
      collapsed.current = state.collapsed;
      setWin(state);
      setNote(loaded);
      setAccess(await shareAccess(stores, noteId));
      setService(svc);
    })();
  }, [noteId]);

  // on close: save input → mark it not to restore next time → delete if empty
  useEffect(() => {
    const unlisten = appWindow.onCloseRequested(async () => {
      flushPendingEdit();
      await flushAllDocs();
      await (await stickyRepo()).update(noteId, { isOpen: false });
      if (service && (await service.discardIfEmpty(noteId))) emitNoteChanged(noteId);
    });
    return () => void unlisten.then((fn) => fn());
  }, [noteId, service]);

  // remember position and size (the collapsed height is not saved)
  useEffect(() => {
    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const scale = await appWindow.scaleFactor();
        const pos = (await appWindow.outerPosition()).toLogical(scale);
        const patch: WindowPatch = { x: Math.round(pos.x), y: Math.round(pos.y) };
        if (!collapsed.current) {
          const size = (await appWindow.innerSize()).toLogical(scale);
          patch.w = Math.round(size.width);
          patch.h = Math.round(size.height);
        }
        updateWindow(patch);
      }, SAVE_BOUNDS_DEBOUNCE_MS);
    };
    const unlisteners = [appWindow.onMoved(save), appWindow.onResized(save)];
    return () => {
      window.clearTimeout(timer);
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateWindow depends only on noteId
  }, [noteId]);

  // apply color etc. changed in the hub or other windows (docSession merges the body live); close the window if the note was trashed
  useEffect(() => {
    if (!service) return;
    return onNoteChangedElsewhere(async (id) => {
      if (id !== noteId) return;
      const latest = await service.get(noteId);
      if (!latest || latest.deletedAt !== null) {
        await appWindow.close();
        return;
      }
      setNote(latest);
      const next = await shareAccess(await openStores(), noteId);
      // keep the same state object for equal values so the editor isn't recreated
      setAccess((prev) =>
        prev.shared === next.shared && prev.viewOnly === next.viewOnly ? prev : next,
      );
    });
  }, [noteId, service]);

  const edit = async (changes: NoteEdit) => {
    const next = await service?.edit(noteId, changes);
    if (!next) return;
    setNote(next);
    emitNoteChanged(noteId);
  };

  const setReminder = async (remindAt: number | null) => {
    const next = await service?.setReminder(noteId, remindAt);
    if (!next) return;
    setNote(next);
    setMenuOpen(false);
    emitNoteChanged(noteId);
  };

  const newSticky = async () => {
    if (!service || !note) return;
    const created = await service.create(note.color);
    emitNoteChanged(created.id);
    const scale = await appWindow.scaleFactor();
    const pos = (await appWindow.outerPosition()).toLogical(scale);
    await openSticky(created.id, {
      at: { x: Math.round(pos.x) + NEW_STICKY_OFFSET, y: Math.round(pos.y) + NEW_STICKY_OFFSET },
    });
  };

  const moveToTrash = async () => {
    if (!service) return;
    await service.trash(noteId);
    emitNoteChanged(noteId);
    await appWindow.close();
  };

  const toggleCollapsed = async () => {
    const next = !collapsed.current;
    updateWindow({ collapsed: next });
    setMenuOpen(false);
    await appWindow.setSize(new LogicalSize(win.w, next ? STICKY_COLLAPSED_HEIGHT : win.h));
  };

  const toggleAlwaysOnTop = async () => {
    const next = !win.alwaysOnTop;
    await appWindow.setAlwaysOnTop(next);
    updateWindow({ alwaysOnTop: next });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void newSticky();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!note) return null;

  return (
    <div
      className={`sticky color-${note.color}${win.collapsed ? " collapsed" : ""}`}
      style={{ opacity: win.opacity }}
    >
      <header
        className="sticky-bar"
        data-tauri-drag-region
        onDoubleClick={(e) => e.target === e.currentTarget && void toggleCollapsed()}
      >
        <button
          type="button"
          className="sticky-btn"
          onClick={newSticky}
          title={t("새 메모 ({key})", { key: appKey("N") })}
        >
          +
        </button>
        <span className="sticky-bar-title" data-tauri-drag-region>
          {win.collapsed ? note.title || t("새 메모") : ""}
        </span>
        <button
          type="button"
          className={`sticky-btn${menuOpen ? " active" : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          title={t("메뉴")}
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        <button
          type="button"
          className="sticky-btn"
          onClick={() => appWindow.close()}
          title={t("닫기 (메모는 목록에 남습니다)")}
        >
          ×
        </button>
      </header>

      {menuOpen && (
        <div className="sticky-menu" role="menu">
          <ColorPicker value={note.color} onChange={(color) => void edit({ color })} />
          <label className="sticky-menu-row">
            <input type="checkbox" checked={win.alwaysOnTop} onChange={toggleAlwaysOnTop} />
            {t("항상 위")}
          </label>
          <label className="sticky-menu-row">
            {t("투명도")}
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={Math.round(win.opacity * 100)}
              onChange={(e) => updateWindow({ opacity: Number(e.target.value) / 100 })}
            />
          </label>
          <details className="sticky-menu-reminder">
            <summary>⏰ {note.remindAt ? formatReminder(note.remindAt) : t("알림")}</summary>
            <ReminderFields value={note.remindAt} onChange={(at) => void setReminder(at)} />
          </details>
          <button type="button" className="sticky-menu-item" onClick={toggleCollapsed}>
            {win.collapsed ? t("펼치기") : t("접기")}
          </button>
          <button type="button" className="sticky-menu-item" onClick={() => void showHub()}>
            {t("메모 목록 열기")}
          </button>
          <button type="button" className="sticky-menu-item danger" onClick={moveToTrash}>
            {t("휴지통으로 이동")}
          </button>
        </div>
      )}

      {!win.collapsed && (
        <div className="sticky-body" onMouseDown={() => setMenuOpen(false)}>
          <NoteEditor
            key={String(viewOnly)}
            noteId={noteId}
            readOnly={viewOnly}
            shared={access.shared}
            autoFocus={note.plainText === "" && !viewOnly}
            onSave={(changes) => void edit(changes)}
          />
          <div
            className="sticky-resize"
            onMouseDown={(e) => {
              e.preventDefault();
              // fails on platforms that resize from window edges instead (e.g. macOS)
              appWindow.startResizeDragging("SouthEast").catch(() => {});
            }}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}
