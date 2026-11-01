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
| Note DB (`urinote.db`) | `%APPDATA%\com.urinote.app` | `~/Library/Application Support/com.urinote.app` | `~/.config/com.urinote.app` |
| DB backup before updates | `backups\<previous version>-<time>` in the folder above (latest 5) | same | same |
| Error log (`urinote.log`, 1 MB × 3) | `%LOCALAPPDATA%\com.urinote.app\logs` | `~/Library/Logs/com.urinote.app` | `~/.local/share/com.urinote.app/logs` |

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

## Testing friend sharing on one PC

Running a second instance with a different app ID (`com.urinote.dev2`) gives it its own DB and device key, so it behaves like another device.

```powershell
cd uri-memo
npm run tauri dev        # device 1 (also starts the Vite server)

# in a new terminal — use a separate build folder so it doesn't clash with device 1's running exe
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target-dev2"
npx tauri dev --config src-tauri/tauri.dev2.conf.json   # device 2
```

Open 👥 (Friends) in both windows and each appears under "Urinote nearby". If the Windows firewall prompt appears on first run, allow **Private networks**.
