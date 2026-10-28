# Urinote(우리노트) 설계 및 개발 계획서

| 항목 | 내용 |
|---|---|
| 제품명 | **Urinote (우리노트)** |
| 문서 버전 | v0.1 (초안) |
| 작성일 | 2026-10-28 |
| 대상 플랫폼 | Windows 10/11, macOS, Android, iOS |
| 앱 ID (안) | `com.urinote.app` |

---

## 1. 개요

### 1.1 제품 비전
> **"생각나는 순간 붙이고, 어디서나 이어 쓰는 우리의 메모."**

Urinote는 PC 바탕화면에 포스트잇처럼 붙여 두는 **스티키 메모**와, 휴대폰에서 같은 메모를 보고 고치는 **동기화 메모장**을 하나로 합친 크로스플랫폼 앱이다.

### 1.2 목표
- 데스크톱: 바탕화면에 떠 있는 메모 창(항상 위, 투명도, 위치 기억)
- 모바일: 같은 메모를 보고 편집하는 전용 앱
- 오프라인 우선: 네트워크가 없어도 모든 기능 사용, 연결되면 자동 동기화
- 단순함: 메모 · 알림 · 동기화에 집중 (위젯/녹화 등 부가 기능 배제)

### 1.3 범위 밖 (v1)
- 실시간 공동 편집 (동시 커서), 메모 공유 링크
- 홈 화면 위젯, 화면 녹화, 날씨/시계 위젯
- 웹 버전 (v2 검토)

---

## 2. 벤치마킹 분석

| 기능 | 에스메모(SMemo) | MS Sticky Notes | Urinote 방향 |
|---|---|---|---|
| 바탕화면 스티키 창 | ✅ | ✅ | ✅ 핵심 |
| 색상 분류 | ✅ | ✅ | ✅ 7색 |
| 폴더 | ✅ | ❌ | ✅ |
| 서식 / 체크리스트 | 일부 | ✅ | ✅ |
| PC↔모바일 동기화 | ✅ (회원가입) | ✅ (모바일은 OneNote 경유) | ✅ **전용 모바일 앱** |
| 알림 | ✅ | ❌ | ✅ |
| 휴지통·복원 | ✅ | 일부 | ✅ |
| 메모 잠금 | ✅ | ❌ | v1.1 |
| 캘린더 / D-Day | ✅ | ❌ | v1.2 |
| 화면 캡처 → 메모 | ✅ | 이미지 첨부 | v1.2 |
| 위젯·녹화 | ✅ | ❌ | ❌ 제외 |

**차별화 포인트**
1. MS Sticky Notes 대비 → 모바일 **전용 앱**과 알림·폴더 제공
2. 에스메모 대비 → 기능을 덜어 낸 **깔끔한 UX**, 가벼운 앱 용량(목표 20MB 이하)
3. 오프라인 우선 + 충돌 시 **데이터 무손실** 동기화

> 참고 제품의 기능만 벤치마킹하며, 이름·아이콘·UI 디자인은 독자적으로 제작한다.

---

## 3. 요구사항

### 3.1 기능 요구사항

우선순위: **P0** = v1.0 필수, **P1** = v1.0 목표, **P2** = 이후 버전

| ID | 영역 | 요구사항 | 우선순위 |
|---|---|---|---|
| F-01 | 메모 | 메모 생성/편집/삭제, 입력 즉시 자동 저장 (500ms 디바운스) | P0 |
| F-02 | 메모 | 7가지 색상 (노랑·초록·분홍·보라·파랑·회색·차콜) | P0 |
| F-03 | 메모 | 서식: 굵게·기울임·밑줄·취소선·글머리 기호·체크리스트 | P0 |
| F-04 | 메모 | 상단 고정(핀), 정렬(수정일/생성일/제목) | P0 |
| F-05 | 검색 | 제목·본문 전문 검색 (한글 지원) | P0 |
| F-06 | 휴지통 | 삭제 메모 30일 보관, 복원/영구 삭제 | P1 |
| F-07 | 폴더 | 폴더 생성/이름 변경/삭제, 메모 이동 | P1 |
| D-01 | 데스크톱 | 메모 1개 = 창 1개 (테두리 없는 스티키 창) | P0 |
| D-02 | 데스크톱 | 창 위치·크기·열림 상태 기억, 재시작 시 복원 | P0 |
| D-03 | 데스크톱 | 항상 위, 투명도(30~100%), 접기(제목만 표시) | P1 |
| D-04 | 데스크톱 | 시스템 트레이 메뉴 (새 메모 / 모두 보이기·숨기기 / 목록 / 종료) | P0 |
| D-05 | 데스크톱 | 전역 단축키 `Ctrl+Alt+N` 새 메모, `Ctrl+Alt+H` 모두 숨기기 | P1 |
| D-06 | 데스크톱 | OS 시작 시 자동 실행 (설정) | P1 |
| M-01 | 모바일 | 메모 목록 (그리드/리스트 전환), 전체 화면 편집기 | P0 |
| M-02 | 모바일 | 다른 앱에서 텍스트 공유 → 새 메모 | P1 |
| S-01 | 계정 | 이메일 + Google 로그인, 로그아웃, 회원 탈퇴 | P0 |
| S-02 | 동기화 | 오프라인 편집, 온라인 시 자동 동기화, 실시간 반영 | P0 |
| S-03 | 동기화 | 충돌 시 데이터 무손실 (충돌 사본 생성) | P0 |
| S-04 | 동기화 | 동기화 상태 표시 (동기화됨/진행 중/오프라인/오류) | P1 |
| N-01 | 알림 | 메모별 알림 시각 설정 → 로컬 알림, 클릭 시 메모 열기 | P1 |
| E-01 | 설정 | 라이트/다크/시스템 테마, 기본 메모 색상, 글꼴 크기 | P1 |
| E-02 | 설정 | JSON 내보내기/가져오기 | P1 |
| X-01 | 보안 | 메모 잠금 (PIN/생체 인증, 본문 로컬 암호화) | P2 |
| X-02 | 일정 | 캘린더 보기, D-Day | P2 |
| X-03 | 첨부 | 이미지 첨부, 화면 캡처 → 메모 | P2 |

### 3.2 비기능 요구사항

| 항목 | 기준 |
|---|---|
| 성능 | 콜드 스타트 1초 이내, 메모 1만 개에서 검색 100ms 이내 |
| 용량 | 데스크톱 설치 파일 20MB 이하 |
| 오프라인 | 모든 메모 기능이 네트워크 없이 동작 |
| 동기화 지연 | 온라인 상태에서 타 기기 반영 3초 이내 |
| 안정성 | 앱 강제 종료 시에도 마지막 입력 손실 1초 이내 |
| 보안 | 전 구간 HTTPS/WSS, 서버 RLS로 사용자 격리, 토큰은 OS 보안 저장소 |
| 접근성 | 키보드 전체 조작, 스크린리더 레이블, 고대비 테마 |
| 다국어 | 한국어 기본, 영어 (i18n 구조) |

---

## 4. 시스템 설계

### 4.1 기술 스택

| 영역 | 기술 | 선정 이유 |
|---|---|---|
| 앱 셸 | **Tauri 2** | 데스크톱+iOS/Android 단일 프로젝트, 작은 용량, 멀티 윈도우·트레이·단축키 지원 |
| UI | **React 19 + TypeScript + Vite** | 전 플랫폼 UI 코드 공유 |
| 스타일 | CSS Modules + CSS 변수 (테마) | 의존성 최소화 |
| 에디터 | **TipTap** (ProseMirror) | 서식/체크리스트, JSON 저장 |
| 상태 관리 | Zustand | 단순, 창 간 상태 분리에 적합 |
| 로컬 DB | **SQLite** (`tauri-plugin-sql`) + FTS5 | 오프라인 저장, 전문 검색 |
| 백엔드 | **Supabase** (Postgres, Auth, Realtime) | 서버 개발 없이 인증·DB·실시간 |
| Tauri 플러그인 | window-state, global-shortcut, autostart, notification, deep-link, store | 데스크톱/모바일 네이티브 기능 |
| 테스트 | Vitest, Testing Library, Playwright, `cargo test` | 단위/통합/E2E |
| CI/CD | GitHub Actions + `tauri-action` | 플랫폼별 빌드·서명·릴리스 |

> **대안 (Plan B)**: Tauri 모바일에서 치명적 제약이 발견되면 모바일만 **Capacitor**로 전환한다. UI·도메인·동기화 코드는 그대로 재사용하도록 플랫폼 계층을 인터페이스로 분리한다 (4.3 참고).

### 4.2 아키텍처

```
┌────────────────────── UI 계층 (React) ──────────────────────┐
│  Hub(목록) 창  │  Sticky 노트 창(N개)  │  설정/로그인  │ 모바일 화면 │
└───────────────┬─────────────────────────────────────────────┘
                │ hooks / Zustand store
┌───────────────▼──────────── 도메인 계층 (TS) ────────────────┐
│  NoteService · FolderService · ReminderService · SearchService │
└───────────────┬───────────────────────────────┬───────────────┘
                │ Repository 인터페이스           │
┌───────────────▼──────────┐       ┌────────────▼─────────────┐
│ LocalRepo (SQLite)        │◀─────▶│ SyncEngine               │◀── HTTPS / WSS ──▶ Supabase
│  - 원본 데이터 (Source of │       │  - outbox(Push)          │                  (Postgres + RLS,
│    Truth)                 │       │  - pull(커서) / Realtime │                   Auth, Realtime)
└──────────────────────────┘       │  - 충돌 해결             │
                                   └──────────────────────────┘
┌──────────────────── 플랫폼 계층 (Platform 인터페이스) ─────────┐
│ Desktop(Tauri/Rust): WindowManager, Tray, GlobalShortcut,     │
│                      Autostart, WindowState                   │
│ Mobile(Tauri):      Notification, ShareIntent, SecureStorage  │
└───────────────────────────────────────────────────────────────┘
```

**설계 원칙**
- **로컬 DB가 원본이다.** UI는 항상 로컬 DB만 읽고 쓴다. 서버는 동기화 대상이다.
- **창 간 통신**: 각 스티키 창은 독립 WebView다. 데이터 변경은 DB에 기록한 뒤 Tauri 이벤트(`note:changed`)를 브로드캐스트하고, 다른 창은 이벤트를 받아 해당 메모를 다시 읽는다.
- **플랫폼 의존 코드는 `platform/` 아래 인터페이스 뒤로 숨긴다.**

### 4.3 프로젝트 구조

```
urinote/
├─ src/                         # 프런트엔드 (공통)
│  ├─ app/                      # 라우팅, 창 종류별 진입점 (hub, sticky, settings)
│  ├─ components/               # 공통 UI (ColorPicker, NoteCard, Toolbar ...)
│  ├─ features/
│  │  ├─ notes/                 # 목록, 편집기, 검색
│  │  ├─ sticky/                # 스티키 창 전용 UI
│  │  ├─ folders/
│  │  ├─ reminders/
│  │  ├─ auth/
│  │  └─ settings/
│  ├─ domain/                   # 엔티티, 서비스, Repository 인터페이스
│  ├─ data/
│  │  ├─ local/                 # SQLite 리포지토리, 마이그레이션
│  │  └─ sync/                  # SyncEngine, Supabase 클라이언트
│  ├─ platform/                 # desktop.ts / mobile.ts (인터페이스 구현)
│  ├─ i18n/                     # ko.json, en.json
│  └─ styles/                   # 테마 변수
├─ src-tauri/                   # Rust (창 관리, 트레이, 플러그인 설정)
│  ├─ src/
│  ├─ capabilities/             # 권한 설정
│  └─ tauri.conf.json
├─ supabase/
│  ├─ migrations/               # 테이블, RLS 정책
│  └─ functions/                # (선택) 정리 작업 등 Edge Function
├─ tests/                       # E2E
└─ docs/                        # 설계 문서
```

### 4.4 데이터 모델

**로컬 (SQLite)**

```sql
CREATE TABLE notes (
  id           TEXT PRIMARY KEY,          -- UUID v7 (기기에서 생성, 시간순 정렬 가능)
  folder_id    TEXT,
  title        TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',  -- TipTap JSON
  plain_text   TEXT NOT NULL DEFAULT '',  -- 검색·미리보기용
  color        TEXT NOT NULL DEFAULT 'yellow',
  pinned       INTEGER NOT NULL DEFAULT 0,
  remind_at    INTEGER,                   -- epoch ms
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER,                   -- 휴지통 / 툼스톤
  rev          INTEGER NOT NULL DEFAULT 0,-- 서버 리비전 (마지막 동기화 기준)
  dirty        INTEGER NOT NULL DEFAULT 1 -- 미전송 변경 여부
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, plain_text, content='notes', tokenize='trigram'); -- 한글 부분 검색

CREATE TABLE folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0, dirty INTEGER DEFAULT 1
);

-- 기기 전용 (동기화하지 않음)
CREATE TABLE sticky_windows (
  note_id TEXT PRIMARY KEY, x INTEGER, y INTEGER, w INTEGER, h INTEGER,
  opacity REAL DEFAULT 1.0, always_on_top INTEGER DEFAULT 0,
  collapsed INTEGER DEFAULT 0, is_open INTEGER DEFAULT 0
);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);  -- last_pulled_rev, device_id 등
```

**서버 (Supabase / Postgres)**

```sql
create table notes (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  folder_id uuid,
  title text not null default '',
  content jsonb not null default '{}',
  plain_text text not null default '',
  color text not null default 'yellow',
  pinned boolean not null default false,
  remind_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,       -- 클라이언트 편집 시각
  deleted_at timestamptz,
  rev bigint not null,                   -- 서버가 부여하는 전역 증가값 (sequence)
  updated_by_device text
);
create index on notes (user_id, rev);
alter table notes enable row level security;
create policy "own notes" on notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- folders 동일 구조
```

### 4.5 동기화 설계

**방식**: 오프라인 우선 + 서버 리비전 커서 + 메모 단위 LWW(Last-Write-Wins) + 충돌 사본

1. **로컬 쓰기**: 편집 → 로컬 DB 저장 (`dirty=1`, `updated_at=now`) → UI 즉시 반영
2. **Push** (변경 후 2초 디바운스 / 온라인 복귀 시)
   - `dirty=1` 레코드를 RPC `push_notes(changes[])`로 일괄 전송
   - 서버는 각 레코드의 `base_rev`(클라이언트가 알고 있던 rev)와 현재 rev를 비교
     - 같으면 → 반영, 새 rev 부여
     - 다르면(다른 기기가 먼저 수정) → **충돌**
3. **충돌 처리**
   - `updated_at`이 더 최신인 쪽을 원본으로 채택
   - 패배한 쪽 내용은 **"(충돌 사본) 제목"** 새 메모로 생성 → 데이터 손실 없음
   - 단, 내용(title/content)이 동일하면 사본을 만들지 않음
4. **Pull**: `rev > last_pulled_rev` 레코드를 페이지 단위로 조회 → 로컬 반영 (`dirty=0`인 레코드만 덮어씀, `dirty=1`이면 충돌 규칙 적용)
5. **Realtime**: 앱 실행 중 `notes` 테이블 변경 구독 → 이벤트 수신 시 Pull 트리거
6. **삭제**: `deleted_at` 툼스톤으로 전파. 휴지통 30일 경과 후 영구 삭제(서버 스케줄 작업)
7. **최초 로그인 시 병합**: 로그인 전 작성한 로컬 메모는 전부 `dirty=1`로 업로드 (덮어쓰지 않음)

**동기화 상태 머신**
```
Idle ──변경/타이머──▶ Pushing ──▶ Pulling ──▶ Idle
  │                     │ 실패                │
  └─오프라인 감지──▶ Offline ◀──────────────────┘ (지수 백오프 재시도: 2s, 4s, 8s … 최대 5분)
```

### 4.6 데스크톱 창 관리

| 창 종류 | 라벨 | 특성 |
|---|---|---|
| Hub (목록) | `hub` | 일반 창, 닫으면 트레이로 숨김 |
| Sticky | `sticky-{noteId}` | `decorations:false`, `transparent:true`, `skipTaskbar:true`, 최소 200×160 |
| Settings | `settings` | 모달형 일반 창 |

- **열기**: 이미 열린 창이면 포커스, 아니면 `sticky_windows`에 저장된 위치로 생성 (없으면 마우스 근처 계단식 배치)
- **위치 저장**: move/resize 이벤트 300ms 디바운스 후 저장
- **화면 밖 보정**: 모니터 구성이 바뀌면 화면 밖에 있는 창을 주 모니터 안으로 이동
- **시작 시 복원**: `is_open=1`인 메모 창을 모두 복원
- **트레이**: 새 메모 / 모든 메모 보이기 / 모두 숨기기 / 목록 열기 / 동기화 상태 / 설정 / 종료

### 4.7 알림 설계
- 데스크톱: 앱(트레이) 실행 중 Rust 측 스케줄러가 `remind_at`을 감시 → OS 알림, 클릭 시 해당 스티키 창 열기
- 모바일: `remind_at` 설정 시 OS 로컬 알림 예약, 변경·삭제 시 예약 갱신·취소
- 동기화로 다른 기기에서 받은 알림도 각 기기에서 재예약
- 이미 지난 알림은 앱 시작 시 "놓친 알림"으로 1회 표시

### 4.8 보안
- Supabase Auth (이메일 OTP / Google OAuth, PKCE + 딥링크 `urinote://auth`)
- 리프레시 토큰은 OS 보안 저장소 (Windows Credential Manager / Keychain / Android Keystore)
- 모든 테이블 RLS 적용, `service_role` 키는 클라이언트에 절대 포함하지 않음
- 회원 탈퇴 시 서버 데이터 cascade 삭제
- (P2) 잠금 메모: 기기별 키로 본문 AES-GCM 암호화 후 동기화

---

## 5. 화면 설계

### 5.1 디자인 원칙
- 종이 질감의 부드러운 파스텔 색상, 넉넉한 여백
- 메모 색상이 곧 UI 테마 (스티키 창 상단 바·툴바가 메모 색을 따름)
- 다크 모드에서는 색상을 채도 낮춘 톤으로 자동 변환

### 5.2 데스크톱 화면

**스티키 노트 창**
```
┌──────────────────────────────┐
│ +                    ⋯    ×  │ ← 드래그 영역 (메모 색상), ⋯: 색상·항상 위·투명도·알림·삭제
├──────────────────────────────┤
│ 장보기                        │
│ ☐ 우유                        │
│ ☑ 계란                        │
│                              │
├──────────────────────────────┤
│ B  I  U  S  •  ☐   🔔         │ ← 포커스 시에만 표시
└──────────────────────────────┘
```

**Hub (목록) 창**
```
┌───────────────────────────────────────────┐
│ Urinote                    ⟳ 동기화됨  ⚙   │
│ [🔍 검색                              ]   │
│ 전체 · 📌고정 · 📁업무 · 📁개인 · 🗑휴지통  │
├───────────────────────────────────────────┤
│ ▌장보기               오전 10:21          │
│ ▌우유, 계란 …                             │
│ ▌회의 메모            어제                │
│ ▌3분기 목표 정리 …                        │
└───────────────────────────────────────────┘
          (더블클릭 → 스티키 창으로 열기)
```

### 5.3 모바일 화면
```
┌──────────────────┐   ┌──────────────────┐
│ Urinote   🔍  ⚙  │   │ ‹        🎨 🔔 ⋯ │
│ 전체 업무 개인 … │   │ 장보기           │
│ ┌──────┐┌──────┐ │   │ ☐ 우유           │
│ │장보기││회의  │ │   │ ☑ 계란           │
│ │우유…││목표…│ │   │                  │
│ └──────┘└──────┘ │   │                  │
│ ┌──────┐         │   │                  │
│ │아이디어│      ⊕ │   │ B I U • ☐       │
│ └──────┘         │   └──────────────────┘
└──────────────────┘      편집 화면
   목록 (그리드)
```

### 5.4 주요 사용자 흐름
1. **첫 실행**: 환영 화면 → "로그인 없이 시작" 또는 "로그인하고 동기화" → 샘플 메모 1개 표시
2. **빠른 메모 (데스크톱)**: `Ctrl+Alt+N` → 커서 근처에 새 스티키 창 → 입력 → 자동 저장
3. **이어 쓰기 (모바일)**: 앱 열기 → PC에서 쓴 메모가 목록 최상단 → 편집 → PC 스티키 창에 즉시 반영

---

## 6. 품질 보증

| 레벨 | 대상 | 도구 |
|---|---|---|
| 단위 | 도메인 서비스, 충돌 해결 로직, 마이그레이션 | Vitest |
| 컴포넌트 | 편집기, 목록, 색상 선택 | Testing Library |
| 통합 | LocalRepo ↔ SyncEngine ↔ Supabase(로컬 `supabase start`) | Vitest + Docker |
| E2E | 메모 CRUD, 스티키 창 열기/복원, 오프라인→온라인 | Playwright, WebDriver(tauri-driver) |
| 수동 | 멀티 모니터, 모바일 실기기, 알림 | 체크리스트 |

**동기화 핵심 테스트 시나리오**
- 두 기기 오프라인 동시 편집 → 온라인 복귀 → 충돌 사본 1개 생성 확인
- A 삭제 / B 편집 동시 발생 → 편집 쪽 보존(복원) 확인
- 1,000개 메모 최초 동기화 → 30초 이내 완료

---

## 7. 개발 계획

### 7.1 일정 (1인 개발 기준, 약 12주)

| 단계 | 기간 | 주요 작업 | 완료 기준 (DoD) |
|---|---|---|---|
| **M0. 환경 구성** | 1주차 | Rust/Tauri 2 설치, React+TS+Vite, ESLint/Prettier, Git, CI(빌드만), **Android 빈 앱 빌드 검증** | 데스크톱·Android에서 빈 앱 실행 |
| **M1. 로컬 메모** | 2~3주차 | SQLite 마이그레이션, LocalRepo, NoteService, Hub 목록, TipTap 편집기, 자동 저장, 색상, 핀, FTS 검색, 휴지통 | 오프라인 CRUD·검색 동작, 단위 테스트 통과 |
| **M2. 스티키 창** | 4~5주차 | 멀티 윈도우, 창 상태 저장/복원, 항상 위·투명도·접기, 트레이, 전역 단축키, 자동 실행, 창 간 이벤트 동기화 | 재부팅 후 스티키 창 원위치 복원 |
| **M3. 계정·동기화** | 6~8주차 | Supabase 스키마·RLS, Auth(이메일/Google, 딥링크), SyncEngine(Push/Pull/Realtime), 충돌 사본, 상태 표시 | 두 PC 간 3초 내 반영, 충돌 시나리오 테스트 통과 |
| **M4. 모바일** | 9~10주차 | 모바일 레이아웃, 편집기 터치 최적화, 공유 받기, 보안 저장소 | 폰↔PC 동기화 실기기 검증 |
| **M5. 알림·폴더·설정** | 11주차 | 알림 예약/놓친 알림, 폴더 관리, 테마/글꼴, JSON 내보내기·가져오기, i18n | 알림 정시 표시, 설정 유지 |
| **M6. 안정화·출시** | 12주차 | E2E, 성능 점검, 아이콘/브랜딩, 코드 서명, 자동 업데이트, MSI/DMG/APK, 스토어 등록 자료 | v1.0 릴리스 후보 |
| **v1.1~** | 이후 | 메모 잠금, iOS 출시, 캘린더/D-Day, 이미지·화면 캡처 | – |

### 7.2 마일스톤 산출물
- **M1 데모**: 단일 창 로컬 메모장
- **M2 데모 (내부 알파)**: 바탕화면 스티키 메모 (로그인 없음) → 실사용 피드백 수집
- **M3 데모 (베타)**: 여러 PC 동기화
- **M6**: v1.0 (Windows, macOS, Android)

### 7.3 브랜치·릴리스 전략
- `main`(릴리스) / `develop` / `feature/*`, PR 리뷰 후 병합
- 버전: SemVer, 태그 푸시 시 GitHub Actions가 플랫폼별 빌드·서명·릴리스 생성
- 데스크톱 자동 업데이트: `tauri-plugin-updater` + GitHub Releases

---

## 8. 리스크 관리

| 리스크 | 영향 | 대응 |
|---|---|---|
| Tauri 모바일 플러그인 성숙도 | 모바일 일정 지연 | M0에서 Android 빌드 선검증, 실패 시 Capacitor로 전환 (Plan B) |
| 동기화 버그로 데이터 손실 | 신뢰도 치명 | 충돌 사본, 툼스톤, 휴지통, 자동 로컬 백업(일 1회), 충돌 시나리오 테스트 우선 작성 |
| 투명/테두리 없는 창의 OS별 차이 | UI 깨짐 | Windows/macOS 각각 수동 테스트, 투명 미지원 시 불투명 대체 |
| 코드 서명 비용·절차 | 설치 경고 (SmartScreen) | Windows 서명 인증서 조기 확보, macOS 공증(Notarization) |
| iOS 배포 요건 (Mac, 개발자 계정 $99/년) | iOS 지연 | v1.0은 Windows/macOS/Android, iOS는 v1.1 |
| Supabase 무료 요금제 한도 | 서비스 중단 | 사용량 모니터링, 유료 전환 기준 사전 정의 |
| 영문권에서 "Uri-" 발음이 "urine"을 연상시킬 수 있음 | 해외 인지도 | 로고·표기를 **"Uri Note / 우리노트"**로 띄어 쓰는 방안 검토 |

---

## 9. 미결 사항

| # | 항목 | 현재 가정 | 결정 필요 시점 |
|---|---|---|---|
| 1 | 앱 셸 | Tauri 2 (Plan B: Capacitor) | M0 시작 전 |
| 2 | 동기화 백엔드 | Supabase | M3 시작 전 |
| 3 | iOS 출시 시점 | v1.1 | M4 시작 전 |
| 4 | 로그인 없이 사용 허용 | 허용 (로컬 전용 모드) | M3 시작 전 |
| 5 | 상표·도메인 | `urinote` 상표(KIPRIS 제9류)·도메인·스토어 중복 확인 필요 | M6 전 |
| 6 | 수익 모델 | 무료 (향후 프리미엄: 첨부 용량·잠금) | v1.1 |
