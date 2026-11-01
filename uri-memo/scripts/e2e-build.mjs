// Builds the app for E2E tests: debug, no installer, separate app ID (kr.urinote.e2e) so tests
// never touch real notes, and a separate target folder so it doesn't clash with a running dev app.
//
//   npm run e2e:build
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npx",
  ["tauri", "build", "--debug", "--no-bundle", "--config", "src-tauri/tauri.e2e.conf.json"],
  {
    cwd: app,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CARGO_TARGET_DIR: join(app, "src-tauri", "target-e2e") },
  },
);
process.exit(result.status ?? 1);
