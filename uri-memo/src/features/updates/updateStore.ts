import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { isDesktopApp } from "../../platform/env";
import { emitAppEvent } from "../../platform/events";
import { flushAllDocs } from "../notes/docSession";
import { flushPendingEdit } from "../notes/editorFlush";

/**
 * Auto-update (hub window only). Checks latest.json on GitHub Releases; when the user presses
 * [Install], saves input in every window, downloads, installs and restarts.
 * Update files are signed with the key in GitHub Secrets and verified with the public key in tauri.conf.json.
 */

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Time for other windows to receive app://flush and save (same as tray "Quit") */
const FLUSH_WAIT_MS = 400;

type Status = "idle" | "available" | "installing" | "error";

interface UpdateState {
  status: Status;
  version: string | null;
  /** Downloaded percentage (0–100), null if the size is unknown */
  progress: number | null;
  error: string | null;
  init(): void;
  install(): Promise<void>;
  /** Skip for now (asked again at the next check) */
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
      // offline or no published release yet → try again at the next check
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
