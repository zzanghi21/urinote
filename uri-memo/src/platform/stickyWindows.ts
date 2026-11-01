import { getAllWebviewWindows, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { StickyWindowRepository } from "../data/local/stickyWindowRepo";
import { t } from "../i18n";

export const STICKY_MIN_WIDTH = 200;
/** 접힌 스티키 = 상단 바만 보이는 높이 */
export const STICKY_COLLAPSED_HEIGHT = 36;

const CASCADE_ORIGIN = { x: 120, y: 120 };
const CASCADE_STEP = 28;

export const stickyLabel = (noteId: string) => `sticky-${noteId}`;

export interface OpenStickyOptions {
  /** 저장된 위치가 없을 때 놓을 곳. 기본값은 계단식 배치 */
  at?: "cursor" | { x: number; y: number };
  focus?: boolean;
}

export async function isStickyOpen(noteId: string) {
  return (await WebviewWindow.getByLabel(stickyLabel(noteId))) !== null;
}

/** 메모를 스티키 창으로 연다. 이미 열려 있으면 앞으로 가져온다. */
export async function openSticky(noteId: string, options: OpenStickyOptions = {}) {
  const existing = await WebviewWindow.getByLabel(stickyLabel(noteId));
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    return;
  }

  const repo = await StickyWindowRepository.open();
  const saved = await repo.get(noteId);
  let position = saved?.x != null && saved.y != null ? { x: saved.x, y: saved.y } : null;
  if (position && !(await isOnScreen(position))) position = null;
  position ??= await initialPosition(options.at);

  const state = await repo.update(noteId, { ...position, isOpen: true });

  const sticky = new WebviewWindow(stickyLabel(noteId), {
    url: `/?sticky=${encodeURIComponent(noteId)}`,
    title: t("Urinote 메모"),
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    width: state.w,
    height: state.collapsed ? STICKY_COLLAPSED_HEIGHT : state.h,
    minWidth: STICKY_MIN_WIDTH,
    minHeight: STICKY_COLLAPSED_HEIGHT,
    decorations: false,
    transparent: true,
    shadow: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: state.alwaysOnTop,
    focus: options.focus ?? true,
  });
  void sticky.once("tauri://error", (e) =>
    console.error("sticky window failed", noteId, e.payload),
  );
}

/** 앱 시작 시 지난번에 열려 있던 스티키를 모두 복원한다 */
export async function restoreOpenStickies() {
  const repo = await StickyWindowRepository.open();
  for (const state of await repo.listOpen()) {
    await openSticky(state.noteId, { focus: false });
  }
}

/** 영구 삭제된 메모의 창과 상태를 정리한다 */
export async function forgetSticky(noteId: string) {
  await (await WebviewWindow.getByLabel(stickyLabel(noteId)))?.destroy();
  await (await StickyWindowRepository.open()).remove(noteId);
}

export async function showHub() {
  const hub = await WebviewWindow.getByLabel("main");
  if (!hub) return;
  await hub.unminimize();
  await hub.show();
  await hub.setFocus();
}

async function initialPosition(at: OpenStickyOptions["at"]) {
  if (at && at !== "cursor") return at;
  if (at === "cursor") {
    const cursor = await cursorPosition();
    const scale = await getCurrentWindow().scaleFactor();
    return { x: Math.round(cursor.x / scale) - 40, y: Math.round(cursor.y / scale) - 18 };
  }
  const open = (await getAllWebviewWindows()).filter((w) => w.label.startsWith("sticky-")).length;
  const offset = (open % 10) * CASCADE_STEP;
  return { x: CASCADE_ORIGIN.x + offset, y: CASCADE_ORIGIN.y + offset };
}

/** 모니터 구성이 바뀌어 창의 제목 줄이 어느 화면에도 보이지 않으면 false */
async function isOnScreen({ x, y }: { x: number; y: number }) {
  const monitors = await availableMonitors();
  const MARGIN = 40;
  return monitors.some((m) => {
    const left = m.position.x / m.scaleFactor;
    const top = m.position.y / m.scaleFactor;
    const right = left + m.size.width / m.scaleFactor;
    const bottom = top + m.size.height / m.scaleFactor;
    return x + MARGIN > left && x + MARGIN < right && y >= top && y + MARGIN < bottom;
  });
}
