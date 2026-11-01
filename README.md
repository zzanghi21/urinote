# Urinote

Stick it the moment you think of it, keep writing anywhere.
Sticky notes for the desktop (Windows / macOS / Ubuntu), with a mobile app (Android / iOS) planned.
Share notes with friends on the same Wi-Fi and edit them together in real time — no server, no account.

- Design and development plan: [docs/DESIGN.md](docs/DESIGN.md)
- App source: [uri-memo/](uri-memo/)
- Stack: Tauri 2 · React 19 · TypeScript · Vite · SQLite · Yjs · iroh (same-Wi-Fi P2P)
- UI languages: Korean (default) and English

## Development setup

All platforms: Node.js 24+, Rust stable (rustup)

- **Windows**: Visual Studio C++ Build Tools, WebView2. **If Smart App Control is on**, it blocks Rust build scripts and the app itself.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Ubuntu 22.04+**:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev \
    libdbus-1-dev pkg-config patchelf build-essential curl file
  ```
- Android: Android Studio, SDK, NDK, JDK 17 (`npm run tauri android init`)

## Commands

```bash
cd uri-memo
npm install
npm run tauri dev      # run the desktop app in development
npm run dev            # UI only, in a browser (http://localhost:1420)
npm run lint           # ESLint
npm run typecheck      # TypeScript
npm test               # frontend unit tests (incl. i18n coverage)
npm run tauri build    # build installers
cargo test --lib --manifest-path src-tauri/Cargo.toml   # Rust tests
```

## Data and log locations

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| Note DB (`urinote.db`) | `%APPDATA%\kr.urinote.app` | `~/Library/Application Support/kr.urinote.app` | `~/.config/kr.urinote.app` |
| DB backup before updates | `backups\<previous version>-<time>` in the folder above (latest 5) | same | same |
| Error log (`urinote.log`, 1 MB × 3) | `%LOCALAPPDATA%\kr.urinote.app\logs` | `~/Library/Logs/kr.urinote.app` | `~/.local/share/kr.urinote.app/logs` |

- Restoring a backup: quit the app completely (tray → Quit), then copy the `urinote.db*` files from the backup folder into the folder above.
- The log contains errors, warnings and context only — never note contents.
- Changing the icon: `npx tauri icon <file>` with a 1024 px PNG or an SVG (source: `src-tauri/icons/source.svg`).

## Per-OS differences

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| Global shortcuts (new note / show·hide notes) | Ctrl+Alt+N / H | ⌥⌘N / H | Ctrl+Alt+N / H (**X11 only**; not available on Wayland) |
| In-app shortcuts | Ctrl+N, Ctrl+F … | ⌘N, ⌘F … | Ctrl+N, Ctrl+F … |
| Tray | Notification area; left click = note list | Menu bar | Top bar (GNOME needs the AppIndicator extension); clicking opens the menu only |
| Device key storage | Credential Manager | Keychain | Secret Service (GNOME Keyring / KWallet); otherwise a 0600 file in the app data folder |
| Finding friends (same Wi-Fi) | Allow "Private networks" in the firewall prompt on first run | Allow "Local Network" access on first run | If ufw is enabled, allow UDP 5353 (mDNS) and the app's port |
| Resizing sticky windows | Bottom-right corner | Window edges | Bottom-right corner |
| Remembering sticky positions | ✅ | ✅ | X11 ✅ / on Wayland apps cannot set window positions, so they may move |
| Installers | .msi / .exe | .dmg (separate Apple Silicon and Intel builds) | .deb / .AppImage / .rpm |

- The app is not code-signed yet (M6). On macOS, the first launch shows an "unidentified developer" warning → in Finder, **right-click the app → Open**.
- Pushing a `v*` tag makes GitHub Actions (`.github/workflows/release.yml`) build installers for all three OSes into a draft release. Running the workflow manually (workflow_dispatch) also makes them downloadable from the Actions page.

## Releasing and auto-update

1. Bump the version in `uri-memo/package.json`, `uri-memo/src-tauri/tauri.conf.json` and `uri-memo/src-tauri/Cargo.toml`.
2. Commit, then tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. GitHub Actions builds signed installers and update files (`latest.json`) into a **draft** release.
4. Review the draft and **publish** it. Installed apps check `releases/latest/download/latest.json` (15 s after start, then every 6 h) and offer "Install and restart".

Update signing:
- The app verifies updates with the public key in `tauri.conf.json` (`plugins.updater.pubkey`).
- The private key and its password are GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). A local copy lives outside the repo in `~/.tauri/urinote-updater.key` (+ `.password`). **Back it up** — if it is lost, installed apps can no longer verify new updates and must be reinstalled manually.
- Building installers locally (`npm run tauri build`) needs the same two values as environment variables; `tauri dev` and `--no-bundle` builds do not.

App ID: `kr.urinote.app` (renamed from `com.urinote.app`). On first run the app copies notes, backups and the device key from the old ID, so friends stay paired. UI settings (theme, language, text size, default color) start from defaults.

## Testing friend sharing on one PC

Running a second instance with a different app ID (`kr.urinote.dev2`) gives it its own DB and device key, so it behaves like another device.

```powershell
cd uri-memo
npm run tauri dev        # device 1 (also starts the Vite server)

# in a new terminal — use a separate build folder so it doesn't clash with device 1's running exe
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target-dev2"
npx tauri dev --config src-tauri/tauri.dev2.conf.json   # device 2
```

Open 👥 (Friends) in both windows and each appears under "Urinote nearby". If the Windows firewall prompt appears on first run, allow **Private networks**.

## License

[MIT](LICENSE) © 2026 zzanghi

Third-party notices: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (also shipped with the installers). After changing dependencies, regenerate it with `npm run licenses` in `uri-memo/` — CI fails if it is out of date.
