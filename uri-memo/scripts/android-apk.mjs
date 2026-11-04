// Builds an Android debug APK, also on Windows without Developer Mode.
//
// `tauri android build` links the Rust library into the Gradle project with a symlink, which
// Windows only allows with Developer Mode (or admin). If that step fails, this copies the
// library instead and finishes with Gradle, skipping Gradle's own Rust step.
//
//   npm run android:apk                 # x86_64 (emulator)
//   npm run android:apk -- aarch64      # phones
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "x86_64";
const ABI = { x86_64: "x86_64", aarch64: "arm64-v8a", armv7: "armeabi-v7a", i686: "x86" };
const TRIPLE = {
  x86_64: "x86_64-linux-android",
  aarch64: "aarch64-linux-android",
  armv7: "armv7-linux-androideabi",
  i686: "i686-linux-android",
};
if (!ABI[target]) throw new Error(`unknown target ${target} (x86_64, aarch64, armv7, i686)`);

const sdk = process.env.ANDROID_HOME ?? join(homedir(), "AppData", "Local", "Android", "Sdk");
const env = { ...process.env, ANDROID_HOME: sdk };
const run = (cmd, args, cwd) =>
  spawnSync(cmd, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" }).status;

const status = run("npx", ["tauri", "android", "build", "--debug", "--apk", "--target", target], app);
const flavor = target === "x86_64" ? "X86_64" : target[0].toUpperCase() + target.slice(1);
const android = join(app, "src-tauri", "gen", "android");
const apk = join(android, "app", "build", "outputs", "apk", target === "x86_64" ? "x86_64" : target, "debug");

if (status !== 0) {
  const lib = join(app, "src-tauri", "target", TRIPLE[target], "debug", "liburinote_lib.so");
  if (!existsSync(lib)) process.exit(status ?? 1);
  console.log("\nSymlink step failed (Windows without Developer Mode?) — copying the library instead");
  const jni = join(android, "app", "src", "main", "jniLibs", ABI[target]);
  mkdirSync(jni, { recursive: true });
  copyFileSync(lib, join(jni, "liburinote_lib.so"));
  const gradle = join(android, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  const code = run(gradle, [`assemble${flavor}Debug`, "-x", `rustBuild${flavor}Debug`], android);
  if (code !== 0) process.exit(code ?? 1);
}
console.log(`\nAPK: ${apk}`);
