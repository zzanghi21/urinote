import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";
import { inTauri } from "./env";

/**
 * Also writes webview errors and warnings to the app log (urinote.log), so problems on users' PCs
 * can be seen. Our code only logs error objects and context, never note bodies; length is capped.
 */
const MAX = 2000;

let sending = false;

function forward(level: "error" | "warn", args: unknown[]) {
  if (sending) return; // don't re-enter from an error raised while sending the log
  sending = true;
  const text = args.map(describe).join(" ").slice(0, MAX);
  const label = `[${window.location.search.includes("sticky") ? "sticky" : "hub"}] ${text}`;
  void (level === "error" ? logError(label) : logWarn(label))
    .catch(() => {})
    .finally(() => (sending = false));
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function initLogging() {
  if (!inTauri) return;
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      forward(level, args);
    };
  }
  window.addEventListener("error", (e) => forward("error", [e.error ?? e.message]));
  window.addEventListener("unhandledrejection", (e) => forward("error", ["unhandled", e.reason]));
}
