import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { remote } from "webdriverio";

/**
 * Runs the real app (built by `npm run e2e:build`) through tauri-driver (WebDriver).
 * Uses its own app ID so tests never touch real notes.
 * - Windows: needs msedgedriver matching the WebView2 version (EDGEDRIVER or ~/.tauri/edgedriver)
 * - Linux: needs webkit2gtk-driver (WebKitWebDriver); run under xvfb-run in CI
 * - macOS: not supported by tauri-driver
 */

const APP_ID = "kr.urinote.e2e";
const PORT = 4444;
const root = fileURLToPath(new URL("..", import.meta.url));

export const appBinary = join(
  root,
  "src-tauri",
  "target-e2e",
  "debug",
  process.platform === "win32" ? "urinote.exe" : "urinote",
);

function dataDirs() {
  const home = homedir();
  if (process.platform === "win32") {
    return [process.env.APPDATA, process.env.LOCALAPPDATA]
      .filter((d): d is string => !!d)
      .map((d) => join(d, APP_ID));
  }
  if (process.platform === "darwin") {
    return [
      join(home, "Library", "Application Support", APP_ID),
      join(home, "Library", "Caches", APP_ID),
    ];
  }
  return [".config", ".local/share", ".cache"].map((d) => join(home, d, APP_ID));
}

/** Deletes the test app's notes, settings and logs (only the E2E app ID) */
export function resetData() {
  for (const dir of dataDirs()) rmSync(dir, { recursive: true, force: true });
}

let driver: ChildProcess | null = null;

export async function startDriver() {
  if (!existsSync(appBinary))
    throw new Error(`Build the app first: npm run e2e:build (${appBinary})`);
  const args = ["--port", String(PORT)];
  if (process.platform === "win32") {
    const edge =
      process.env.EDGEDRIVER ?? join(homedir(), ".tauri", "edgedriver", "msedgedriver.exe");
    args.push("--native-driver", edge);
  }
  driver = spawn("tauri-driver", args, { stdio: ["ignore", "ignore", "inherit"] });
  // wait until the driver accepts connections
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/status`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("tauri-driver did not start");
}

export function stopDriver() {
  driver?.kill();
  driver = null;
}

/** Starts the app. Closing the session (`deleteSession`) quits it. */
export async function launch() {
  const browser = await remote({
    hostname: "127.0.0.1",
    port: PORT,
    logLevel: "warn",
    capabilities: {
      // tauri-driver speaks classic WebDriver only
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application: appBinary },
    } as WebdriverIO.Capabilities,
  });
  await browser.$(".sidebar").waitForExist({ timeout: 30_000 });
  return browser;
}

export type App = Awaited<ReturnType<typeof launch>>;

/** Fixes the UI language so selectors (aria-labels) don't depend on the OS language */
export async function setLanguage(app: App, language: "ko" | "en") {
  await app.execute((lang) => {
    const key = "urinote:settings";
    const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...settings, language: lang }));
  }, language);
  await app.refresh();
  await app.$(".sidebar").waitForExist({ timeout: 30_000 });
}
