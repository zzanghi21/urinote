import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { isDesktopApp } from "../../platform/env";
import { emitAppEvent } from "../../platform/events";
import { flushAllDocs } from "../notes/docSession";
import { flushPendingEdit } from "../notes/editorFlush";

/**
 * 자동 업데이트 (Hub 창 전용). GitHub Releases 의 latest.json 을 확인하고,
 * 사용자가 [설치]를 누르면 모든 창의 입력을 저장한 뒤 내려받아 설치하고 다시 시작한다.
 * 업데이트 파일은 GitHub Secrets 의 키로 서명되고, 앱은 tauri.conf.json 의 공개키로 검증한다.
 */

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 다른 창들이 app://flush 를 받고 저장할 시간 (트레이 "종료"와 같음) */
const FLUSH_WAIT_MS = 400;

type Status = "idle" | "available" | "installing" | "error";

interface UpdateState {
  status: Status;
  version: string | null;
  /** 내려받은 비율 (0~100), 크기를 모르면 null */
  progress: number | null;
  error: string | null;
  init(): void;
  install(): Promise<void>;
  /** 이번에는 넘어간다 (다음 확인 때 다시 알림) */
  dismiss(): void;
}

export const useUpdate = create<UpdateState>((set, get) => {
  let update: Update | null = null;
  let started = false;

  const checkNow = async () => {
    if (get().status === "installing") return;
    try {
      const found = await check();
      if (!found) return;
      update = found;
      set({ status: "available", version: found.version, error: null });
    } catch {
      // 오프라인이거나 아직 공개된 릴리스가 없다 → 다음 확인 때 다시
    }
  };

  return {
    status: "idle",
    version: null,
    progress: null,
    error: null,

    init() {
      if (!isDesktopApp || started) return;
      started = true;
      window.setTimeout(() => void checkNow(), FIRST_CHECK_DELAY_MS);
      window.setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
    },

    async install() {
      if (!update) return;
      set({ status: "installing", progress: null, error: null });
      try {
        flushPendingEdit();
        await flushAllDocs();
        await emitAppEvent("app://flush");
        await new Promise((r) => window.setTimeout(r, FLUSH_WAIT_MS));

        let total = 0;
        let received = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          if (event.event === "Progress") {
            received += event.data.chunkLength;
            if (total > 0) set({ progress: Math.min(100, Math.round((received / total) * 100)) });
          }
        });
        await relaunch();
      } catch (e) {
        console.error("[update]", e);
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },

    dismiss() {
      set({ status: "idle" });
    },
  };
});
