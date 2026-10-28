# Urinote (우리노트)

생각나는 순간 붙이고, 어디서나 이어 쓰는 우리의 메모.
데스크톱(Windows/macOS) 스티키 메모 + 모바일(Android/iOS) 동기화 메모 앱.

- 설계 및 개발 계획: [docs/DESIGN.md](docs/DESIGN.md)
- 스택: Tauri 2 · React 19 · TypeScript · Vite · SQLite · Supabase

## 개발 환경

- Node.js 24+, Rust stable (rustup), Visual Studio C++ Build Tools, WebView2
- Windows: **스마트 앱 컨트롤(Smart App Control)이 켜져 있으면** Rust 빌드 스크립트와 앱 실행이 차단된다.
- Android: Android Studio, SDK, NDK, JDK 17 (`npm run tauri android init`)

## 명령어

```bash
npm install
npm run tauri dev      # 데스크톱 개발 실행
npm run dev            # 브라우저에서 UI만 실행 (http://localhost:1420)
npm run lint           # ESLint
npm run typecheck      # TypeScript 검사
npm run tauri build    # 설치 파일 빌드
```
