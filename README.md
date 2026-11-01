# Urinote (우리노트)

생각나는 순간 붙이고, 어디서나 이어 쓰는 우리의 메모.
데스크톱(Windows / macOS / Ubuntu) 스티키 메모 + 모바일(Android/iOS, 예정) 메모 앱.

- 설계 및 개발 계획: [docs/DESIGN.md](docs/DESIGN.md)
- 앱 소스: [uri-memo/](uri-memo/)
- 스택: Tauri 2 · React 19 · TypeScript · Vite · SQLite · Yjs · iroh (같은 Wi-Fi P2P)

## 개발 환경

공통: Node.js 24+, Rust stable (rustup)

- **Windows**: Visual Studio C++ Build Tools, WebView2. **스마트 앱 컨트롤(Smart App Control)이 켜져 있으면** Rust 빌드 스크립트와 앱 실행이 차단된다.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Ubuntu 22.04+**:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev \
    libdbus-1-dev pkg-config patchelf build-essential curl file
  ```
- Android: Android Studio, SDK, NDK, JDK 17 (`npm run tauri android init`)

## 데이터·로그 위치

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| 메모 DB (`urinote.db`) | `%APPDATA%\com.urinote.app` | `~/Library/Application Support/com.urinote.app` | `~/.config/com.urinote.app` |
| 업데이트 전 DB 백업 | 위 폴더의 `backups\<이전 버전>-<시각>` (최근 5개) | 〃 | 〃 |
| 오류 로그 (`urinote.log`, 1MB × 3) | `%LOCALAPPDATA%\com.urinote.app\logs` | `~/Library/Logs/com.urinote.app` | `~/.local/share/com.urinote.app/logs` |

- 백업에서 되돌리기: 앱을 완전히 종료(트레이 → 종료)한 뒤 백업 폴더의 `urinote.db*` 파일을 위 폴더로 복사한다.
- 로그에는 오류·경고와 상황만 남고 메모 본문은 남지 않는다.
- 아이콘 바꾸기: 1024px PNG 또는 SVG 로 `npx tauri icon <파일>` (원본: `src-tauri/icons/source.svg`)

## OS별 차이

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| 전역 단축키 (새 메모 / 메모 보이기·숨기기) | Ctrl+Alt+N / H | ⌥⌘N / H | Ctrl+Alt+N / H (**X11 만**, Wayland 에서는 동작하지 않음) |
| 앱 안 단축키 | Ctrl+N, Ctrl+F … | ⌘N, ⌘F … | Ctrl+N, Ctrl+F … |
| 트레이 | 알림 영역, 왼쪽 클릭 = 메모 목록 | 메뉴 막대 | 상단 표시줄 (GNOME 은 AppIndicator 확장 필요). 클릭 시 메뉴만 열림 |
| 기기 키 저장 | 자격 증명 관리자 | 키체인 | Secret Service(GNOME 키링·KWallet). 없으면 앱 데이터 폴더의 파일(0600) |
| 친구 찾기(같은 Wi-Fi) | 첫 실행 시 방화벽 "개인 네트워크" 허용 | 첫 실행 시 "로컬 네트워크" 접근 허용 | 방화벽(ufw)을 켰다면 UDP 5353(mDNS)과 앱 포트 허용 |
| 스티키 창 크기 조절 | 오른쪽 아래 모서리 | 창 가장자리 | 오른쪽 아래 모서리 |
| 스티키 창 위치 기억 | ✅ | ✅ | X11 ✅ / Wayland 는 창 위치를 앱이 정할 수 없어 매번 바뀔 수 있음 |
| 설치 파일 | .msi / .exe | .dmg (Apple Silicon, Intel 따로) | .deb / .AppImage / .rpm |

- 아직 코드 서명을 하지 않아(M6), macOS 는 처음 열 때 "확인되지 않은 개발자" 경고가 뜬다 → Finder 에서 앱을 **오른쪽 클릭 → 열기**.
- 설치 파일은 `v*` 태그를 올리면 GitHub Actions(`.github/workflows/release.yml`)가 세 OS 모두 만들어 Release 초안에 올린다. Actions 화면에서 수동 실행(workflow_dispatch)해도 결과물을 받을 수 있다.

## 명령어

```bash
cd uri-memo
npm install
npm run tauri dev      # 데스크톱 개발 실행
npm run dev            # 브라우저에서 UI만 실행 (http://localhost:1420)
npm run lint           # ESLint
npm run typecheck      # TypeScript 검사
npm test               # 프런트엔드 단위 테스트
npm run tauri build    # 설치 파일 빌드
cargo test --lib --manifest-path src-tauri/Cargo.toml   # Rust 테스트 (P2P)
```

## 친구 공유를 PC 한 대에서 시험하기

두 번째 인스턴스를 다른 앱 ID(`com.urinote.dev2`)로 띄우면 DB·기기 키가 분리되어 "다른 기기"처럼 동작한다.

```powershell
cd uri-memo
npm run tauri dev        # 1번 기기 (Vite 서버도 여기서 뜬다)

# 새 터미널에서 — 실행 중인 1번 exe 와 겹치지 않게 빌드 폴더를 나눈다
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target-dev2"
npx tauri dev --config src-tauri/tauri.dev2.conf.json   # 2번 기기
```

양쪽에서 👥(친구)를 열면 서로 "근처의 Urinote"에 나타난다. 처음 실행 시 Windows 방화벽 창이 뜨면 **개인 네트워크**를 허용한다.
