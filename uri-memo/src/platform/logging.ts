import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";
import { inTauri } from "./env";

/**
 * 화면(웹뷰)의 오류·경고를 앱 로그 파일(urinote.log)에도 남긴다. 사용자 PC 에서 생긴 문제를 볼 수 있게.
 * 우리 코드는 오류 객체와 상황만 console 에 쓰고 메모 본문은 쓰지 않는다. 길이도 자른다.
 */
const MAX = 2000;

let sending = false;

function forward(level: "error" | "warn", args: unknown[]) {
  if (sending) return; // 로그 전송 중 생긴 오류로 다시 들어오지 않게
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
