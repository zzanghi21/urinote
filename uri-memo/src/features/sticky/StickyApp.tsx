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

/** 바탕화면에 붙는 메모 1개 = 창 1개 */
export function StickyApp({ noteId }: { noteId: string }) {
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

  // 닫을 때: 입력 저장 → 다음 실행 때 복원하지 않도록 표시 → 빈 메모면 삭제
  useEffect(() => {
    const unlisten = appWindow.onCloseRequested(async () => {
      flushPendingEdit();
      await flushAllDocs();
      await (await stickyRepo()).update(noteId, { isOpen: false });
      if (service && (await service.discardIfEmpty(noteId))) emitNoteChanged(noteId);
    });
    return () => void unlisten.then((fn) => fn());
  }, [noteId, service]);

  // 위치·크기 기억 (접힌 상태의 높이는 저장하지 않는다)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateWindow 는 noteId 에만 의존
  }, [noteId]);

  // Hub 나 다른 창에서 바뀐 색상 등 반영 (본문은 docSession 이 실시간 병합). 휴지통으로 가면 창을 닫는다.
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
      // 같은 값이면 상태를 그대로 두어 편집기를 다시 만들지 않는다
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
        <button type="button" className="sticky-btn" onClick={newSticky} title="새 메모 (Ctrl+N)">
          +
        </button>
        <span className="sticky-bar-title" data-tauri-drag-region>
          {win.collapsed ? note.title || "새 메모" : ""}
        </span>
        <button
          type="button"
          className={`sticky-btn${menuOpen ? " active" : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          title="메뉴"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        <button
          type="button"
          className="sticky-btn"
          onClick={() => appWindow.close()}
          title="닫기 (메모는 목록에 남습니다)"
        >
          ×
        </button>
      </header>

      {menuOpen && (
        <div className="sticky-menu" role="menu">
          <ColorPicker value={note.color} onChange={(color) => void edit({ color })} />
          <label className="sticky-menu-row">
            <input type="checkbox" checked={win.alwaysOnTop} onChange={toggleAlwaysOnTop} />
            항상 위
          </label>
          <label className="sticky-menu-row">
            투명도
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={Math.round(win.opacity * 100)}
              onChange={(e) => updateWindow({ opacity: Number(e.target.value) / 100 })}
            />
          </label>
          <button type="button" className="sticky-menu-item" onClick={toggleCollapsed}>
            {win.collapsed ? "펼치기" : "접기"}
          </button>
          <button type="button" className="sticky-menu-item" onClick={() => void showHub()}>
            메모 목록 열기
          </button>
          <button type="button" className="sticky-menu-item danger" onClick={moveToTrash}>
            휴지통으로 이동
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
              void appWindow.startResizeDragging("SouthEast");
            }}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}
