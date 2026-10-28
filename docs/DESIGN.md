# Urinote(우리노트) 설계 및 개발 계획서

| 항목 | 내용 |
|---|---|
| 제품명 | **Urinote (우리노트)** |
| 문서 버전 | v0.2 — CRDT(Yjs) 기반 동기화, 친구 공유(P2P + 암호화 중계) 추가 |
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
- 친구 공유 (v1.1): 메모를 친구와 **실시간 공동 편집**. 기기끼리 직접(P2P) 연결하고, 안 되면 **종단간 암호화된 중계**로 전달

### 1.3 범위 밖 (v1)
- 공개 웹 링크 공유 (로그인 없이 보기)
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
| 메모 잠금 | ✅ | ❌ | v1.2 |
| 친구와 메모 공유 | ❌ | ❌ | ✅ v1.1 (실시간 공동 편집, 종단간 암호화) |
| 캘린더 / D-Day | ✅ | ❌ | v1.2 |
| 화면 캡처 → 메모 | ✅ | 이미지 첨부 | v1.2 |
| 위젯·녹화 | ✅ | ❌ | ❌ 제외 |

**차별화 포인트**
1. MS Sticky Notes 대비 → 모바일 **전용 앱**과 알림·폴더 제공
2. 에스메모 대비 → 기능을 덜어 낸 **깔끔한 UX**, 가벼운 앱 용량(목표 20MB 이하)
3. 오프라인 우선 + **CRDT 자동 병합** 동기화 (충돌 사본 없음)
4. 친구와 **종단간 암호화 공동 편집**: 서버는 내용을 읽을 수 없음

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
| S-03 | 동기화 | 동시 편집 자동 병합 (CRDT), 데이터 무손실 | P0 |
| S-04 | 동기화 | 동기화 상태 표시 (동기화됨/진행 중/오프라인/오류) | P1 |
| S-05 | 동기화 | 같은 PC의 여러 창(Hub·스티키)에서 같은 메모 동시 편집 시 실시간 병합 | P0 |
| SH-01 | 공유 | 메모별 친구 초대 (초대 링크 / QR), 수락 시 공동 편집 시작 | v1.1 |
| SH-02 | 공유 | 권한: 편집 가능 / 보기 전용, 멤버 목록·내보내기(추방) | v1.1 |
| SH-03 | 공유 | 실시간 공동 편집, 상대 커서·이름 표시 | v1.1 |
| SH-04 | 공유 | 기기 간 직접 연결(P2P) 우선, 실패·상대 오프라인 시 암호화 중계 | v1.1 |
| SH-05 | 공유 | 공유 메모 종단간 암호화 (서버·중계는 암호문만 저장) | v1.1 |
| SH-06 | 공유 | 공유 해제 (이후 변경 차단, 이미 받은 사본은 회수 불가함을 안내) | v1.1 |
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
| 에디터 | **TipTap** (ProseMirror) + Collaboration 확장 | 서식/체크리스트, Yjs 문서에 직접 바인딩 |
| CRDT | **Yjs** (`y-prosemirror`, `y-protocols/awareness`) | 오프라인 편집·다기기·공동 편집 자동 병합, 증분 업데이트 전송 |
| P2P 전송 | **WebRTC DataChannel** (v1.1) | 웹뷰 기본 지원으로 데스크톱·모바일 공통 코드. 시그널링은 Supabase Realtime 재사용 |
| 암호화 | **libsodium** (`libsodium-wrappers`) | 공유 키 봉인(X25519 sealed box), 업데이트 암호화(XChaCha20-Poly1305) |
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
│  - 메타 + 목록/검색 캐시  │       │  - 문서 업데이트 Push    │                  (Postgres + RLS,
│  - Yjs 문서 (스냅샷 +     │       │  - 커서 Pull / Realtime  │                   Auth, Realtime)
│    업데이트 로그)         │       │  - 메타 LWW              │
└──────────────────────────┘       └────────────┬─────────────┘
                                   ┌────────────▼─────────────┐
                                   │ ShareEngine (v1.1)       │◀── WebRTC P2P ──▶ 친구 기기
                                   │  - 공간 키·초대·암호화   │
                                   │  - P2P 피어 / 커서 표시  │
                                   └──────────────────────────┘
┌──────────────────── 플랫폼 계층 (Platform 인터페이스) ─────────┐
│ Desktop(Tauri/Rust): WindowManager, Tray, GlobalShortcut,     │
│                      Autostart, WindowState                   │
│ Mobile(Tauri):      Notification, ShareIntent, SecureStorage  │
└───────────────────────────────────────────────────────────────┘
```

**설계 원칙**
- **로컬 DB가 원본이다.** UI는 항상 로컬 DB만 읽고 쓴다. 서버는 동기화 대상이다.
- **본문은 CRDT(Yjs) 문서다.** 내 다른 창·내 다른 기기·친구 기기의 편집이 모두 같은 방식(Yjs 업데이트 교환)으로 병합된다. 충돌 사본은 만들지 않는다.
- **메타데이터는 사용자 개인 것이다.** 색상·고정·폴더·알림·휴지통·창 위치는 공유 메모라도 사람마다 다르며, 내 기기끼리만 동기화한다.
- **창 간 통신**: 각 스티키 창은 독립 WebView다. 본문 편집은 Yjs 업데이트를 Tauri 이벤트(`doc:update`)로 즉시 다른 창에 보내 실시간 병합하고, 메타 변경은 `note:changed` 이벤트로 알린다.
- **플랫폼 의존 코드는 `platform/` 아래 인터페이스 뒤로 숨긴다.**

### 4.3 프로젝트 구조

```
memo-app/                       # 저장소 루트
├─ docs/                        # 설계 문서
├─ .github/workflows/           # CI
└─ uri-memo/                    # 앱 소스 (npm/tauri 명령은 여기서 실행)
   ├─ src/                      # 프런트엔드 (공통)
   │  ├─ app/                   # 라우팅, 창 종류별 진입점 (hub, sticky, settings)
   │  ├─ components/            # 공통 UI (ColorPicker, NoteCard, Toolbar ...)
   │  ├─ features/
   │  │  ├─ notes/              # 목록, 편집기, 검색
   │  │  ├─ sticky/             # 스티키 창 전용 UI
   │  │  ├─ folders/
   │  │  ├─ reminders/
   │  │  ├─ auth/
   │  │  └─ settings/
   │  ├─ domain/                # 엔티티, 서비스, Repository 인터페이스
   │  ├─ data/
   │  │  ├─ local/              # SQLite / 메모리 리포지토리
   │  │  └─ sync/               # SyncEngine, Supabase 클라이언트
   │  ├─ platform/              # desktop.ts / mobile.ts (인터페이스 구현)
   │  ├─ i18n/                  # ko.json, en.json
   │  └─ styles/                # 테마 변수
   ├─ src-tauri/                # Rust (창 관리, 트레이, 플러그인 설정)
   │  ├─ src/
   │  ├─ migrations/            # SQLite 스키마
   │  ├─ capabilities/          # 권한 설정
   │  └─ tauri.conf.json
   ├─ supabase/
   │  ├─ migrations/            # 테이블, RLS 정책
   │  └─ functions/             # (선택) 정리 작업 등 Edge Function
   └─ tests/                    # E2E
```

### 4.4 데이터 모델

**메모 = Yjs 문서(본문) + 개인 메타데이터**

| 구분 | 저장 위치 | 병합 방식 | 공유 시 |
|---|---|---|---|
| 본문 (서식 포함) | Yjs 문서의 `content` (Y.XmlFragment, TipTap Collaboration 바인딩) | CRDT 자동 병합 | 멤버 모두 같은 문서 |
| 제목·본문 텍스트 | `notes.title`, `notes.plain_text` (문서에서 파생한 **캐시**) | 문서 변경 시 재계산 | 각자 계산 |
| 색상·고정·폴더·알림·휴지통 | `notes` 행 | 행 단위 LWW (`updated_at`) | **사람마다 다름** |
| 스티키 창 상태 | `sticky_windows` | 동기화 안 함 (기기 전용) | – |

**로컬 (SQLite)** — `0001_init.sql`(M1) + `0002_yjs.sql`(M3)

```sql
-- notes: M1 스키마 유지. content 열은 Yjs 전환 후 사용하지 않는다(기존 데이터 변환용으로만 읽음).
ALTER TABLE notes ADD COLUMN space_id TEXT;         -- 문서가 속한 공간 (개인 공간 / 공유 공간)

-- Yjs 문서: 압축된 스냅샷 + 그 뒤에 쌓이는 업데이트 로그
CREATE TABLE note_docs (
  note_id     TEXT PRIMARY KEY,
  snapshot    TEXT NOT NULL,                        -- base64(Y.encodeStateAsUpdate)
  updated_at  INTEGER NOT NULL
);
CREATE TABLE note_doc_updates (                     -- 추가 전용(append-only) → 여러 창이 동시에 써도 유실 없음
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     TEXT NOT NULL,
  data        TEXT NOT NULL,                        -- base64(Yjs 업데이트)
  origin      TEXT NOT NULL,                        -- 'local' | 'remote'
  pushed      INTEGER NOT NULL DEFAULT 0,           -- 서버 업로드 여부 (= Push 대기열)
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_doc_updates_note ON note_doc_updates (note_id, seq);
CREATE INDEX idx_doc_updates_unpushed ON note_doc_updates (pushed, seq);

-- v1.1 공유
CREATE TABLE spaces (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL,          -- 'personal' | 'shared'
  role TEXT NOT NULL,                               -- 'owner' | 'editor' | 'viewer'
  key_version INTEGER, space_key TEXT               -- 공간 키 (OS 보안 저장소 키로 다시 암호화해 보관)
);
```

- **문서 읽기**: `snapshot` + 그 뒤의 `note_doc_updates`를 순서대로 적용
- **문서 쓰기**: 업데이트 1건을 `note_doc_updates`에 INSERT만 한다 (읽고-수정-쓰기 없음)
- **압축**: Hub 창이 유휴 시, 업로드가 끝난 업데이트가 50건을 넘는 문서를 스냅샷에 합치고 로그를 지운다 (압축은 Hub 한 곳에서만)
- **기존 메모 변환**: M3 첫 실행 시 `content`(TipTap JSON)를 `y-prosemirror`로 Yjs 문서로 바꿔 스냅샷에 저장

**서버 (Supabase / Postgres)**

```sql
create table spaces (
  id uuid primary key,
  kind text not null check (kind in ('personal', 'shared')),
  created_by uuid not null references auth.users,
  key_version int not null default 1,               -- 공유 공간 키 교체 시 증가
  created_at timestamptz not null default now()
);
create table space_members (
  space_id uuid references spaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (space_id, user_id)
);

-- 본문: 추가 전용 업데이트 로그 + 압축 스냅샷
create table doc_updates (
  seq bigserial primary key,                        -- Pull 커서
  note_id uuid not null,
  space_id uuid not null references spaces on delete cascade,
  data bytea not null,                              -- Yjs 업데이트 (공유 공간은 암호문)
  key_version int,                                  -- null = 암호화 안 함 (개인 공간)
  author uuid not null references auth.users,
  created_at timestamptz not null default now()
);
create index on doc_updates (space_id, seq);
create table doc_snapshots (
  note_id uuid primary key,
  space_id uuid not null references spaces on delete cascade,
  data bytea not null, key_version int,
  upto_seq bigint not null                          -- 이 seq 까지 포함한 상태
);

-- 개인 메타데이터 (사람마다 한 행)
create table note_meta (
  note_id uuid, user_id uuid references auth.users on delete cascade,
  space_id uuid not null references spaces,
  folder_id uuid, color text not null, pinned boolean not null default false,
  remind_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null, updated_at timestamptz not null,
  rev bigint not null,                              -- 서버 sequence, Pull 커서
  primary key (note_id, user_id)
);

-- RLS: 공간 멤버만 읽기, owner/editor 만 doc_updates 쓰기, note_meta 는 본인 행만
alter table doc_updates enable row level security;
create policy "members read" on doc_updates for select
  using (exists (select 1 from space_members m where m.space_id = doc_updates.space_id and m.user_id = auth.uid()));
create policy "editors write" on doc_updates for insert
  with check (author = auth.uid() and exists (select 1 from space_members m
    where m.space_id = doc_updates.space_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));
-- doc_snapshots, spaces, space_members, note_meta 도 같은 원칙으로 정책 작성
```

### 4.5 동기화 설계

**방식**: 오프라인 우선 + **본문은 Yjs 업데이트 교환(CRDT)**, 메타데이터는 행 단위 LWW. 충돌 사본은 없다.

**본문 (Yjs)**
1. **로컬 편집**: 편집기 → Yjs 업데이트 발생 → `note_doc_updates`에 INSERT (`origin='local'`, `pushed=0`) → `doc:update` 이벤트로 같은 PC의 다른 창에 즉시 전달 → 제목·텍스트 캐시 갱신 (500ms 디바운스)
2. **Push** (2초 디바운스 / 온라인 복귀 시): 메모별로 `pushed=0` 업데이트를 `Y.mergeUpdates`로 묶어 `doc_updates`에 INSERT → 성공 시 `pushed=1`
3. **Pull**: `seq > last_seq` 인 내 공간들의 업데이트를 받아 문서에 적용 (`origin='remote'`, `pushed=1`) → 열린 창에 `doc:update` 전달 → 캐시 재계산 → `last_seq` 갱신
   - Yjs 업데이트는 **멱등·순서 무관**이라 중복 수신이나 순서 뒤바뀜이 있어도 결과가 같다
4. **Realtime**: `doc_updates` INSERT 구독 → 즉시 Pull
5. **새 기기**: `doc_snapshots` + 그 이후 `doc_updates`만 받는다
6. **서버 압축**: 메모별 업데이트가 200건을 넘으면, 한 클라이언트가 병합 상태를 `doc_snapshots`에 올리고 `upto_seq` 이하 업데이트를 삭제 (RPC, 공유 공간은 암호화된 스냅샷)

**메타데이터 (note_meta)**
1. 로컬 변경 → `dirty=1` → Push 시 `updated_at`이 서버 값보다 새로울 때만 반영 (행 단위 LWW), 서버가 새 `rev` 부여
2. Pull: `rev > last_meta_rev` 행 반영 (`dirty=1`인 로컬 행은 `updated_at` 비교)
3. 색상·핀 같은 값이라 동시 변경 시 마지막 값을 채택해도 데이터 손실 문제가 없다

**공통**
- **삭제**: `deleted_at` 툼스톤으로 전파. 휴지통 30일 경과 후 영구 삭제 (개인 공간 문서·업데이트 삭제)
- **최초 로그인 시 병합**: 로그인 전 작성한 메모는 개인 공간에 업로드. 다른 기기의 같은 메모는 없으므로(UUID) 덮어쓰기가 일어나지 않는다
- **암호화**: v1.0 개인 공간은 TLS + RLS 보호(서버에서 평문), v1.1 공유 공간은 종단간 암호화 (4.9). 개인 공간 종단간 암호화는 v1.2 검토

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

### 4.9 친구 공유 설계 (v1.1)

**결정 사항**: 공유 형태 = **실시간 공동 편집**, 전송 = **P2P 우선 + 종단간 암호화 중계**, 공유 단위 = 메모 1개 (폴더 공유는 v1.2)

**구조**
```
[내 기기] ══ WebRTC DataChannel (실시간: 업데이트 + 커서) ══ [친구 기기]
    │                                                         │
    └──▶ Supabase doc_updates (암호문 보관: 오프라인 상대 전달) ◀──┘
         Supabase Realtime (시그널링: SDP/ICE 교환)
```
- **중계는 항상, P2P는 가능할 때**: 모든 업데이트는 작성자 기기가 암호화해 `doc_updates`에 올린다 (상대가 오프라인이어도 다음 접속 때 받음). 두 사람이 동시에 온라인이면 WebRTC로도 즉시 보내 지연을 없애고 커서를 표시한다.
- Yjs 업데이트는 멱등이므로 P2P와 중계로 같은 업데이트를 두 번 받아도 문제없다.
- 중계 경로가 항상 있으므로 **TURN 서버는 두지 않는다**. 공용 STUN만 사용하고, 직접 연결에 실패하면 중계만으로 동작한다 (지연 1~3초).

**키와 암호화**
| 키 | 용도 | 보관 |
|---|---|---|
| 기기 키쌍 (X25519) | 공간 키를 기기별로 봉인해 받기 | 개인키: OS 보안 저장소 / 공개키: 서버 `devices` 테이블 |
| 공간 키 (32바이트, 버전 있음) | 업데이트·스냅샷 암호화 (XChaCha20-Poly1305) | 멤버 기기마다 봉인본(`space_keys`) |
| 초대 비밀값 | 초대 링크 안에서 공간 키 전달 | 링크의 `#` 뒤 (서버로 전송되지 않음) |

**흐름**
1. **공유 시작**: 메모를 공유 공간으로 옮김 → 공간 키 생성 → 현재 문서 상태를 암호화한 스냅샷 업로드 → 내 기기들에 공간 키 봉인
2. **초대**: 권한(편집/보기)·만료(기본 7일)·사용 횟수를 정해 초대 생성 → `urinote://invite/<id>#<secret>` 링크 / QR 표시. 서버에는 `secret`으로 암호화한 공간 키만 저장
3. **수락**: 친구가 링크 열기 → 로그인 → 초대 조회 → `secret`으로 공간 키 복호화 → 서버가 초대 유효성 확인 후 멤버 추가 → 친구 기기들에 공간 키 봉인 → 스냅샷 + 업데이트 받아 메모 생성
4. **새 기기 추가**: 멤버의 새 기기가 등록되면, 온라인인 같은 멤버의 기존 기기가 공간 키를 새 기기용으로 봉인
5. **공동 편집**: 같은 공간 멤버가 온라인이면 Realtime 채널 `space:<id>`에서 시그널링 → WebRTC 연결 → Yjs 업데이트·커서(awareness) 교환. 시그널링 메시지도 공간 키로 암호화·인증
6. **권한**: 보기 전용 멤버는 편집기가 읽기 전용, 서버 RLS가 `doc_updates` 쓰기를 거부, P2P 수신 측도 보기 전용 멤버의 업데이트를 버림
7. **추방·공유 해제**: 멤버 제거 → **공간 키 교체**(새 버전 키를 남은 멤버 기기에만 봉인) → 이후 업데이트는 새 키. 이미 받아 간 내용은 회수할 수 없음을 UI에서 안내
8. **공간 삭제**: 소유자가 공유를 끝내면 다른 멤버에게는 "개인 사본으로 보관 / 삭제" 선택지 제공

**개인 설정은 공유하지 않는다**: 공유 메모라도 색상·고정·폴더·알림·휴지통·스티키 위치는 사람마다 따로 (`note_meta`가 사용자별 행)

**추가 서버 테이블 (v1.1)**
```sql
devices (id uuid pk, user_id, public_key bytea, name text, created_at)
space_keys (space_id, device_id, key_version, sealed_key bytea, primary key (space_id, device_id, key_version))
invites (id uuid pk, space_id, role, encrypted_key bytea, expires_at, max_uses, uses, created_by)
-- RLS: space_keys 는 자기 기기 행만 읽기, invites 는 id 를 아는 로그인 사용자만 조회 (RPC 로 수락)
```

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
| 단위 | 도메인 서비스, Yjs 병합·압축, 기존 메모 변환, 암호화 | Vitest |
| 컴포넌트 | 편집기, 목록, 색상 선택 | Testing Library |
| 통합 | LocalRepo ↔ SyncEngine ↔ Supabase(로컬 `supabase start`) | Vitest + Docker |
| E2E | 메모 CRUD, 스티키 창 열기/복원, 오프라인→온라인 | Playwright, WebDriver(tauri-driver) |
| 수동 | 멀티 모니터, 모바일 실기기, 알림 | 체크리스트 |

**동기화 핵심 테스트 시나리오**
- 두 기기가 오프라인에서 같은 메모의 다른 줄·같은 줄을 편집 → 온라인 복귀 → 두 편집이 모두 남고 양쪽 결과가 같음
- 같은 PC의 Hub와 스티키에서 같은 메모 동시 입력 → 두 창 내용 일치, 재시작 후에도 유지
- A 삭제 / B 편집 동시 발생 → 편집 쪽 보존(복원) 확인
- 업데이트 중복·순서 뒤바뀜 수신 → 결과 동일 (멱등성)
- 1,000개 메모 최초 동기화 → 30초 이내 완료

**공유 테스트 시나리오 (v1.1)**
- 초대 링크 수락 → 3초 이내 메모 표시, 서버 DB에 평문이 없는지 확인
- 친구 오프라인 중 편집 → 친구 접속 시 반영 (중계 경로)
- 둘 다 온라인 → P2P 연결 성립, 커서 표시, 지연 300ms 이내
- 보기 전용 멤버의 편집 시도 → 서버·P2P 양쪽에서 거부
- 멤버 추방 → 키 교체 후 추방된 멤버가 새 업데이트를 복호화하지 못함

---

## 7. 개발 계획

### 7.1 일정 (1인 개발 기준, v1.0 약 13주 + v1.1 공유 약 4주)

| 단계 | 기간 | 주요 작업 | 완료 기준 (DoD) |
|---|---|---|---|
| **M0. 환경 구성** ✅ | 1주차 | Rust/Tauri 2 설치, React+TS+Vite, ESLint/Prettier, Git, CI | 데스크톱 빈 앱 실행 (Android 검증은 M4로 이동) |
| **M1. 로컬 메모** ✅ | 2~3주차 | SQLite 마이그레이션, LocalRepo, NoteService, Hub 목록, TipTap 편집기, 자동 저장, 색상, 핀, FTS 검색, 휴지통 | 오프라인 CRUD·검색 동작, 단위 테스트 통과 |
| **M2. 스티키 창** ✅ | 4~5주차 | 멀티 윈도우, 창 상태 저장/복원, 항상 위·투명도·접기, 트레이, 전역 단축키, 자동 실행, 창 간 이벤트 동기화 | 재부팅 후 스티키 창 원위치 복원 |
| **M3a. Yjs 전환 (로컬)** | 6주차 | `0002_yjs.sql`, 문서 저장소(스냅샷 + 업데이트 로그), TipTap Collaboration 바인딩, 창 간 `doc:update` 실시간 병합, 기존 메모 변환, 로컬 압축 | Hub·스티키 동시 편집 병합, 기존 메모 무손실 변환 |
| **M3b. 계정·동기화** | 7~9주차 | Supabase 스키마·RLS, Auth(이메일/Google, 딥링크), SyncEngine(문서 업데이트 Push/Pull/Realtime, 메타 LWW), 서버 스냅샷 압축, 상태 표시 | 두 PC 오프라인 동시 편집 후 자동 병합, 3초 내 반영 |
| **M4. 모바일** | 10~11주차 | Android 빌드, 모바일 레이아웃, 편집기 터치 최적화, 공유 받기, 보안 저장소 | 폰↔PC 동기화 실기기 검증 |
| **M5. 알림·폴더·설정** | 12주차 | 알림 예약/놓친 알림, 폴더 관리, 테마/글꼴, JSON 내보내기·가져오기, i18n | 알림 정시 표시, 설정 유지 |
| **M6. 안정화·출시** | 13주차 | E2E, 성능 점검, 아이콘/브랜딩, 코드 서명, 자동 업데이트, MSI/DMG/APK, 스토어 등록 자료 | v1.0 릴리스 후보 |
| **v1.1 친구 공유** | 14~17주차 | 기기 키·공간 키·암호화(libsodium), 공유 공간·초대 링크/QR, 수락 RPC, 암호화 중계, WebRTC P2P·시그널링, 커서 표시, 권한·추방·키 교체 | 4.9 공유 테스트 시나리오 통과 |
| **v1.2~** | 이후 | 메모 잠금, iOS 출시, 폴더 공유, 개인 공간 종단간 암호화, 캘린더/D-Day, 이미지·화면 캡처 | – |

### 7.2 마일스톤 산출물
- **M1 데모**: 단일 창 로컬 메모장
- **M2 데모 (내부 알파)**: 바탕화면 스티키 메모 (로그인 없음) → 실사용 피드백 수집
- **M3 데모 (베타)**: 여러 PC 동기화 (자동 병합)
- **M6**: v1.0 (Windows, macOS, Android)
- **v1.1**: 친구와 공동 편집

### 7.3 브랜치·릴리스 전략
- `main`(릴리스) / `develop` / `feature/*`, PR 리뷰 후 병합
- 버전: SemVer, 태그 푸시 시 GitHub Actions가 플랫폼별 빌드·서명·릴리스 생성
- 데스크톱 자동 업데이트: `tauri-plugin-updater` + GitHub Releases

---

## 8. 리스크 관리

| 리스크 | 영향 | 대응 |
|---|---|---|
| Tauri 모바일 플러그인 성숙도 | 모바일 일정 지연 | M0에서 Android 빌드 선검증, 실패 시 Capacitor로 전환 (Plan B) |
| 동기화 버그로 데이터 손실 | 신뢰도 치명 | CRDT 병합, 추가 전용 업데이트 로그, 툼스톤, 휴지통, 자동 로컬 백업(일 1회), 동기화 시나리오 테스트 우선 작성 |
| Yjs 문서·업데이트 로그 비대화 | 저장 공간·로딩 속도 | 로컬(50건)·서버(200건) 기준 스냅샷 압축, 오래된 툼스톤 GC |
| 공유 키 분실 (멤버의 모든 기기 분실) | 서버 암호문 복구 불가 | 다른 멤버 기기에서 재봉인, 로컬 사본은 유지, 키 백업(복구 문구)은 v1.2 검토 |
| P2P 직접 연결 실패 (대칭 NAT 등) | 실시간성 저하 | 암호화 중계 경로로 자동 대체 (기능은 동일, 지연 1~3초) |
| 공유 메모 회수 불가 | 사용자 오해 | 공유·추방 시 "이미 받은 사본은 회수할 수 없음" 명시 |
| 투명/테두리 없는 창의 OS별 차이 | UI 깨짐 | Windows/macOS 각각 수동 테스트, 투명 미지원 시 불투명 대체 |
| 코드 서명 비용·절차 | 설치 경고 (SmartScreen) | Windows 서명 인증서 조기 확보, macOS 공증(Notarization) |
| iOS 배포 요건 (Mac, 개발자 계정 $99/년) | iOS 지연 | v1.0은 Windows/macOS/Android, iOS는 v1.2 |
| Supabase 무료 요금제 한도 | 서비스 중단 | 사용량 모니터링, 유료 전환 기준 사전 정의 |
| 영문권에서 "Uri-" 발음이 "urine"을 연상시킬 수 있음 | 해외 인지도 | 로고·표기를 **"Uri Note / 우리노트"**로 띄어 쓰는 방안 검토 |

---

## 9. 미결 사항

| # | 항목 | 현재 가정 | 결정 필요 시점 |
|---|---|---|---|
| 1 | 앱 셸 | ✅ Tauri 2 확정 (Plan B: Capacitor) | – |
| 2 | 동기화 백엔드 | Supabase (프로젝트 URL·anon key 필요) | M3b 시작 전 |
| 3 | 동기화 방식 | ✅ Yjs(CRDT) 확정 | – |
| 4 | 공유 형태·전송 | 실시간 공동 편집 + P2P/암호화 중계 (권장안으로 가정, 확인 필요) | v1.1 시작 전 |
| 5 | iOS 출시 시점 | v1.2 | M4 시작 전 |
| 6 | 로그인 없이 사용 허용 | 허용 (로컬 전용 모드, 공유는 로그인 필요) | M3b 시작 전 |
| 7 | 상표·도메인 | `urinote` 상표(KIPRIS 제9류)·도메인·스토어 중복 확인 필요 | M6 전 |
| 8 | 수익 모델 | 무료 (향후 프리미엄: 첨부 용량·잠금·공유 인원) | v1.1 |
