# Urinote (우리노트)

생각나는 순간 붙이고, 어디서나 이어 쓰는 우리의 메모.
데스크톱(Windows/macOS) 스티키 메모 + 모바일(Android/iOS) 동기화 메모 앱.

- 설계 및 개발 계획: [docs/DESIGN.md](docs/DESIGN.md)
- 앱 소스: [uri-memo/](uri-memo/)
- 스택: Tauri 2 · React 19 · TypeScript · Vite · SQLite · Yjs · iroh (같은 Wi-Fi P2P)

## 개발 환경

- Node.js 24+, Rust stable (rustup), Visual Studio C++ Build Tools, WebView2
- Windows: **스마트 앱 컨트롤(Smart App Control)이 켜져 있으면** Rust 빌드 스크립트와 앱 실행이 차단된다.
- Android: Android Studio, SDK, NDK, JDK 17 (`npm run tauri android init`)

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
