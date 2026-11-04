# Urinote — Design and Development Plan

| Item | Details |
|---|---|
| Product | **Urinote** (Korean: 우리노트, "our notes") |
| Document version | v0.3 — friend sharing redesigned as **serverless P2P on the same Wi-Fi** (v0.2: CRDT (Yjs) sync) |
| Date | 2026-10-28 |
| Target platforms | Windows 10/11, macOS, Ubuntu 22.04+ (desktop), Android, iOS |
| App ID | `kr.urinote.app` (renamed from `com.urinote.app`; data and device key migrate automatically on first run) |

---

## 1. Overview

### 1.1 Vision
> **"Stick it the moment you think of it, keep writing anywhere — notes for us."**

Urinote is a cross-platform app that combines **sticky notes** pinned to the PC desktop like Post-its with a **synced notebook** for viewing and editing the same notes on a phone.

### 1.2 Goals
- Desktop: note windows floating on the desktop (always on top, opacity, remembered position)
- Mobile: a dedicated app to view and edit the same notes
- Offline first: every feature works without a network; syncs automatically when connected
- Simplicity: focus on notes, reminders and sync (no widgets, recording or other extras)
- Friend sharing (v1.1): **real-time co-editing** of notes with **friends on the same Wi-Fi**, over direct encrypted device-to-device (P2P) connections with no server or account

### 1.3 Out of scope (v1)
- Public web links (view without signing in)
- Home-screen widgets, screen recording, weather/clock widgets
- Web version (to be considered for v2)

---

## 2. Benchmark

| Feature | SMemo | MS Sticky Notes | Urinote |
|---|---|---|---|
| Desktop sticky windows | ✅ | ✅ | ✅ core |
| Color labels | ✅ | ✅ | ✅ 7 colors |
| Folders | ✅ | ❌ | ✅ |
| Formatting / checklists | partial | ✅ | ✅ |
| PC ↔ mobile sync | ✅ (sign-up) | ✅ (mobile via OneNote) | ✅ **dedicated mobile app** |
| Reminders | ✅ | ❌ | ✅ |
| Trash & restore | ✅ | partial | ✅ |
| Note lock | ✅ | ❌ | v1.2 |
| Share notes with friends | ❌ | ❌ | ✅ v1.1 (same Wi-Fi, serverless real-time co-editing) |
| Calendar / D-Day | ✅ | ❌ | v1.2 |
| Screen capture → note | ✅ | image attachments | v1.2 |
| Widgets / recording | ✅ | ❌ | ❌ excluded |

**Differentiators**
1. vs. MS Sticky Notes → a **dedicated mobile app**, reminders and folders
2. vs. SMemo → a **clean UX** with fewer features and a small footprint (target ≤ 20 MB)
3. Offline-first sync with **automatic CRDT merging** (no conflict copies)
4. **Serverless co-editing** with friends: notes never leave our own devices

> Only features of the reference products are benchmarked; the name, icon and UI design are original.

---

## 3. Requirements

### 3.1 Functional requirements

Priority: **P0** = required for v1.0, **P1** = target for v1.0, **P2** = later versions

| ID | Area | Requirement | Priority |
|---|---|---|---|
| F-01 | Notes | Create/edit/delete notes, auto-save as you type (500 ms debounce) | P0 |
| F-02 | Notes | 7 colors (yellow, green, pink, purple, blue, gray, charcoal) | P0 |
| F-03 | Notes | Formatting: bold, italic, underline, strikethrough, bullets, checklists | P0 |
| F-04 | Notes | Pin to top; sort by modified / created / title | P0 |
| F-05 | Search | Full-text search of titles and bodies (Korean supported) | P0 |
| F-06 | Trash | Keep deleted notes for 30 days; restore / delete forever | P1 |
| F-07 | Folders | Create / rename / delete folders, move notes | P1 |
| D-01 | Desktop | One note = one window (frameless sticky window) | P0 |
| D-02 | Desktop | Remember window position, size and open state; restore on restart | P0 |
| D-03 | Desktop | Always on top, opacity (30–100%), collapse (title only) | P1 |
| D-04 | Desktop | System tray menu (new note / show·hide all / list / quit) | P0 |
| D-05 | Desktop | Global shortcuts: `Ctrl+Alt+N` new note, `Ctrl+Alt+H` hide all (⌥⌘ on macOS) | P1 |
| D-06 | Desktop | Start at login (setting) | P1 |
| M-01 | Mobile | Note list (grid/list), full-screen editor | P0 |
| M-02 | Mobile | Share text from other apps → new note | P1 |
| S-01 | Account | Email + Google sign-in, sign-out, account deletion | P0 |
| S-02 | Sync | Edit offline, sync automatically when online, live updates | P0 |
| S-03 | Sync | Automatic merging of concurrent edits (CRDT), no data loss | P0 |
| S-04 | Sync | Sync status (synced / syncing / offline / error) | P1 |
| S-05 | Sync | Live merging when the same note is edited in several windows (hub / sticky) on one PC | P0 |
| SH-01 | Sharing | Auto-discover Urinote devices on the same Wi-Fi; **add friends by comparing a 6-digit code** | v1.1 |
| SH-02 | Sharing | Share per note: pick friends + permission (edit / view only) → starts when they accept | v1.1 |
| SH-03 | Sharing | Real-time co-editing on the same Wi-Fi, with the other person's cursor and name | v1.1 |
| SH-04 | Sharing | Edits made while apart **merge automatically when devices meet again on the same Wi-Fi** (can be relayed by other members) | v1.1 |
| SH-05 | Sharing | Mutually authenticated, encrypted device connections (others on the same Wi-Fi cannot snoop or join) | v1.1 |
| SH-06 | Sharing | Remove members / leave / end sharing (explain that copies already received cannot be recalled) | v1.1 |
| N-01 | Reminders | Per-note reminder time → local notification, opens the note | P1 |
| E-01 | Settings | Light / dark / system theme, default note color, font size | P1 |
| E-02 | Settings | JSON export / import | P1 |
| X-01 | Security | Note lock (PIN / biometrics, local encryption of the body) | P2 |
| X-02 | Schedule | Calendar view, D-Day | P2 |
| X-03 | Attachments | Image attachments, screen capture → note | P2 |

### 3.2 Non-functional requirements

| Item | Target |
|---|---|
| Performance | Cold start within 1 s; search within 100 ms with 10,000 notes |
| Size | Desktop installer ≤ 20 MB |
| Offline | Every note feature works without a network |
| Sync latency | Changes appear on other devices within 3 s when online |
| Reliability | At most 1 s of the last input lost on a forced quit |
| Security | HTTPS/WSS end to end, per-user isolation with server RLS, tokens in the OS secure store |
| Accessibility | Full keyboard operation, screen-reader labels, high-contrast theme |
| Languages | Korean by default, English (i18n structure) |

---

## 4. System design

### 4.1 Tech stack

| Area | Technology | Why |
|---|---|---|
| App shell | **Tauri 2** | One project for desktop + iOS/Android, small size, multi-window, tray and shortcuts |
| UI | **React 19 + TypeScript + Vite** | UI code shared across all platforms |
| Styling | CSS + CSS variables (themes) | Minimal dependencies |
| Editor | **TipTap** (ProseMirror) + Collaboration extension | Formatting/checklists, bound directly to the Yjs document |
| CRDT | **Yjs** (`y-prosemirror`, `y-protocols/awareness`) | Automatic merging for offline, multi-device and co-editing; incremental updates |
| P2P transport | **iroh** (Rust, QUIC) — relays off + local discovery (mDNS) (v1.1) | Device ID = Ed25519 public key, with built-in mutual authentication and encryption (TLS 1.3). Desktop, Android, iOS. Alternative: `libp2p` (mdns + noise) |
| Signatures | iroh device key (Ed25519) | The owner signs the share member list → cannot be forged even when relayed by other members |
| Key storage | `keyring` crate (Windows Credential Manager / macOS Keychain / Linux Secret Service, else a 0600 file / Android Keystore) | Device secret key kept in the OS secure store |
| State | Zustand | Simple; fits separate state per window |
| Local DB | **SQLite** (`tauri-plugin-sql`) + FTS5 | Offline storage, full-text search |
| Backend | **Supabase** (Postgres, Auth, Realtime) | Auth, DB and realtime without writing a server |
| Tauri plugins | global-shortcut, autostart, single-instance, notification, dialog, log, sql | Native desktop/mobile features |
| Tests | Vitest, Testing Library, Playwright, `cargo test` | Unit / integration / E2E |
| CI/CD | GitHub Actions + `tauri-action` | Per-platform builds, signing, releases |

> **Plan B**: if Tauri mobile hits a blocking limitation, switch the mobile app alone to **Capacitor**. The platform layer is separated behind interfaces so UI, domain and sync code can be reused as is (see 4.3).

### 4.2 Architecture

```
┌────────────────────── UI layer (React) ───────────────────────┐
│  Hub (list) window │ Sticky note windows (N) │ Settings │ Mobile │
└───────────────┬────────────────────────────────────────────────┘
                │ hooks / Zustand store
┌───────────────▼──────────── Domain layer (TS) ─────────────────┐
│  NoteService · FolderService · ReminderService · SearchService  │
└───────────────┬───────────────────────────────┬────────────────┘
                │ Repository interfaces          │
┌───────────────▼──────────┐       ┌────────────▼─────────────┐
│ LocalRepo (SQLite)        │◀─────▶│ SyncEngine               │◀── HTTPS / WSS ──▶ Supabase
│  - metadata + list/search │       │  - push doc updates      │                  (Postgres + RLS,
│    cache                  │       │  - cursor pull / realtime│                   Auth, Realtime)
│  - Yjs docs (snapshot +   │       │  - metadata LWW          │
│    update log)            │       └────────────┬─────────────┘
└──────────────────────────┘       ┌────────────▼─────────────┐
                                   │ ShareEngine (v1.1, hub)  │◀── same-Wi-Fi P2P ──▶ friend devices
                                   │  - friends, share members│      (iroh QUIC, Rust)
                                   │  - Yjs sync protocol     │
                                   │  - permission checks,    │
                                   │    cursors               │
                                   └──────────────────────────┘
┌──────────────────── Platform layer (Platform interfaces) ──────┐
│ Desktop (Tauri/Rust): WindowManager, Tray, GlobalShortcut,     │
│                       Autostart, WindowState                   │
│ Mobile (Tauri):       Notification, ShareIntent, SecureStorage │
└────────────────────────────────────────────────────────────────┘
```

**Principles**
- **The local DB is the source of truth.** The UI only reads and writes the local DB; the server is a sync target.
- **The note body is a CRDT (Yjs) document.** Edits from my other windows, my other devices and friends' devices all merge the same way (exchanging Yjs updates). No conflict copies.
- **Metadata belongs to each user.** Color, pin, folder, reminder, trash and window position differ per person even for shared notes, and only sync between my own devices.
- **Cross-window communication**: each sticky window is an independent WebView. Body edits are sent to other windows immediately as Yjs updates via a Tauri event (`doc:update`) and merged live; metadata changes are announced with `note:changed`.
- **Platform-specific code lives behind interfaces under `platform/`.**

### 4.3 Project layout

```
memo-app/                       # repository root
├─ docs/                        # design documents
├─ .github/workflows/           # CI and release builds
└─ uri-memo/                    # app source (run npm/tauri commands here)
   ├─ src/                      # frontend (shared)
   │  ├─ components/            # shared UI (ColorPicker ...)
   │  ├─ features/
   │  │  ├─ notes/              # list, editor, search, folders
   │  │  ├─ sticky/             # sticky-window UI
   │  │  ├─ reminders/
   │  │  ├─ settings/           # settings, backup
   │  │  └─ share/              # friends, sharing, cursors
   │  ├─ domain/                # entities, services, repository interfaces
   │  ├─ data/
   │  │  └─ local/              # SQLite / in-memory repositories
   │  ├─ platform/              # Tauri wrappers (windows, events, P2P, files, tray)
   │  └─ i18n/                  # t("Korean text") + en.ts (Korean text is the key; tests catch missing translations)
   ├─ src-tauri/                # Rust (windows, tray, P2P, reminders, plugins)
   │  ├─ src/
   │  ├─ migrations/            # SQLite schema
   │  ├─ capabilities/          # permissions
   │  └─ tauri.conf.json
   └─ tests/                    # source-level checks (i18n coverage)
```

### 4.4 Data model

**Note = Yjs document (body) + personal metadata**

| Part | Stored in | Merge | When shared |
|---|---|---|---|
| Body (with formatting) | Yjs document field `content` (Y.XmlFragment, TipTap Collaboration binding) | automatic CRDT merge | one document for all members |
| Title / body text | `notes.title`, `notes.plain_text` (a **cache** derived from the document) | recomputed on document change | computed by each device |
| Color, pin, folder, reminder, trash | `notes` row | row-level LWW (`updated_at`) | **different per person** |
| Sticky window state | `sticky_windows` | not synced (device only) | – |

**Local (SQLite)** — `0001_init.sql` (M1) + `0002_yjs.sql` (M3)

```sql
-- notes: M1 schema kept. The content column is no longer used after the Yjs switch (read only for migration).
ALTER TABLE notes ADD COLUMN space_id TEXT;         -- space the document belongs to (personal / shared)

-- Yjs documents: compacted snapshot + update log appended after it
CREATE TABLE note_docs (
  note_id     TEXT PRIMARY KEY,
  snapshot    TEXT NOT NULL,                        -- base64(Y.encodeStateAsUpdate)
  synced_sv   TEXT,                                 -- base64(state vector the server has) → diff to push
  updated_at  INTEGER NOT NULL
);
CREATE TABLE note_doc_updates (                     -- append-only → no loss when several windows write at once
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     TEXT NOT NULL,
  data        TEXT NOT NULL,                        -- base64(Yjs update)
  origin      TEXT NOT NULL,                        -- 'local' | 'remote'
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_doc_updates_note ON note_doc_updates (note_id, seq);
-- deleting a note row deletes its document and log via a trigger

-- v1.1 sharing (0003_contacts.sql, 0004_shares.sql) — device-local only. No server tables.
CREATE TABLE contacts (                             -- friend devices added with a confirmation code
  device_id   TEXT PRIMARY KEY,                     -- iroh device ID (Ed25519 public key)
  name        TEXT NOT NULL,                        -- display name chosen by the friend (I can rename it)
  paired_at   INTEGER NOT NULL,
  last_seen   INTEGER
);
CREATE TABLE shares (                               -- shared notes (marked by notes.space_id = note_id)
  note_id     TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,                        -- owner device ID
  members     TEXT NOT NULL,                        -- signed member list JSON (see 4.9)
  version     INTEGER NOT NULL,                     -- member list version (higher = newer)
  signature   TEXT NOT NULL,                        -- signature by the owner's device key
  status      TEXT NOT NULL                         -- 'active' | 'left' | 'ended'
);
CREATE TABLE share_outbox (                         -- offers and member-list changes for friends not met yet
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL, note_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

- **Reading a document**: apply `snapshot`, then the following `note_doc_updates` in order
- **Writing a document**: just INSERT one update into `note_doc_updates` (no read-modify-write)
- **Compaction**: at startup and every 5 minutes, the hub window merges the log of documents with more than 50 updates into the snapshot and deletes that log (only the hub compacts). Upload state is tracked by `synced_sv`, so compaction does not affect it
- **Migrating old notes**: on the first M3 run, `content` (TipTap JSON) is converted to a Yjs document with `y-prosemirror` and stored as the snapshot

**Server (Supabase / Postgres)**

```sql
create table spaces (
  id uuid primary key,
  kind text not null check (kind in ('personal', 'shared')),
  created_by uuid not null references auth.users,
  key_version int not null default 1,               -- incremented when a shared space's key is rotated
  created_at timestamptz not null default now()
);
create table space_members (
  space_id uuid references spaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (space_id, user_id)
);

-- body: append-only update log + compacted snapshot
create table doc_updates (
  seq bigserial primary key,                        -- pull cursor
  note_id uuid not null,
  space_id uuid not null references spaces on delete cascade,
  data bytea not null,                              -- Yjs update (ciphertext for shared spaces)
  key_version int,                                  -- null = not encrypted (personal space)
  author uuid not null references auth.users,
  created_at timestamptz not null default now()
);
create index on doc_updates (space_id, seq);
create table doc_snapshots (
  note_id uuid primary key,
  space_id uuid not null references spaces on delete cascade,
  data bytea not null, key_version int,
  upto_seq bigint not null                          -- state including updates up to this seq
);

-- personal metadata (one row per person)
create table note_meta (
  note_id uuid, user_id uuid references auth.users on delete cascade,
  space_id uuid not null references spaces,
  folder_id uuid, color text not null, pinned boolean not null default false,
  remind_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null, updated_at timestamptz not null,
  rev bigint not null,                              -- server sequence, pull cursor
  primary key (note_id, user_id)
);

-- RLS: space members read, only owner/editor write doc_updates, note_meta only own rows
alter table doc_updates enable row level security;
create policy "members read" on doc_updates for select
  using (exists (select 1 from space_members m where m.space_id = doc_updates.space_id and m.user_id = auth.uid()));
create policy "editors write" on doc_updates for insert
  with check (author = auth.uid() and exists (select 1 from space_members m
    where m.space_id = doc_updates.space_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));
-- doc_snapshots, spaces, space_members and note_meta follow the same principles
```

### 4.5 Sync design

**Approach**: offline first + **body synced by exchanging Yjs updates (CRDT)**, metadata with row-level LWW. No conflict copies.

**Body (Yjs)**
1. **Local edit**: editor → Yjs update (batched 200 ms) → INSERT into `note_doc_updates` (`origin='local'`) → after saving, send a `doc:update` event to other windows on the same PC → refresh the title/text cache (500 ms debounce)
2. **Push** (2 s debounce / when back online): per note, build only the diff the server lacks with `Y.encodeStateAsUpdate(doc, synced_sv)` and INSERT it into `doc_updates` → update `synced_sv` on success
3. **Pull**: fetch updates of my spaces with `seq > last_seq` and apply them (`origin='remote'`, also reflected in `synced_sv`) → send `doc:update` to open windows → recompute caches → update `last_seq`
   - Yjs updates are **idempotent and order-independent**, so duplicates or reordering give the same result
4. **Realtime**: subscribe to `doc_updates` INSERTs → pull immediately
5. **New device**: download only `doc_snapshots` plus later `doc_updates`
6. **Server compaction**: when a note has more than 200 updates, one client uploads the merged state to `doc_snapshots` and deletes updates up to `upto_seq` (RPC; encrypted snapshot for shared spaces)

**Metadata (note_meta)**
1. Local change → `dirty=1` → on push, applied only if `updated_at` is newer than the server's (row-level LWW); the server assigns a new `rev`
2. Pull: apply rows with `rev > last_meta_rev` (compare `updated_at` for local rows with `dirty=1`)
3. These are values like color and pin, so taking the last value on concurrent changes loses no data

**Common**
- **Deletion**: propagated as `deleted_at` tombstones. Deleted forever after 30 days in the trash (personal-space documents and updates removed)
- **Merge on first sign-in**: notes written before signing in are uploaded to the personal space. Other devices cannot have the same note (UUIDs), so nothing is overwritten
- **Encryption**: server sync of personal notes (M3b) is protected by TLS + RLS (plaintext on the server). End-to-end encryption of the personal space is considered for v1.2
- **Relation to friend sharing**: friend sharing (4.9) uses no server. It works without M3b server sync, and shared notes are never uploaded to a server

**Sync state machine**
```
Idle ──change/timer──▶ Pushing ──▶ Pulling ──▶ Idle
  │                       │ failure             │
  └──offline detected──▶ Offline ◀──────────────┘ (exponential backoff: 2s, 4s, 8s … up to 5 min)
```

### 4.6 Desktop window management

| Window | Label | Properties |
|---|---|---|
| Hub (list) | `main` | regular window; closing hides it to the tray |
| Sticky | `sticky-{noteId}` | `decorations:false`, `transparent:true`, `skipTaskbar:true`, minimum 200×160 |

- **Open**: focus the window if it is already open; otherwise create it at the position saved in `sticky_windows` (or cascade near the mouse if none)
- **Save position**: save 300 ms after move/resize events
- **Off-screen correction**: if the monitor layout changes, move windows that are off screen back onto the primary monitor
- **Restore at startup**: reopen every note window with `is_open=1`
- **Tray**: new note / show all notes / hide all / open list / start at login / quit
- **Quit**: every quit path (tray, ⌘Q on macOS, logout) first tells all windows to save pending input
- **Per-OS differences** (shortcuts, tray, Wayland limits): see the "Per-OS differences" table in the README

### 4.7 Reminders
- Desktop: while the app (tray) is running, the hub passes the list of upcoming reminders to the Rust scheduler (`reminders.rs`) → at the time it shows an OS notification, opens the note as a sticky window and clears the reminder (fires once). Notification click callbacks are not supported on Windows, so the sticky window is opened directly instead
- Changing a reminder time does not change the list order (modified time). Notes in the trash do not fire
- Mobile: schedule an OS local notification when `remind_at` is set; reschedule or cancel on change or deletion
- Reminders received from other devices via sync are rescheduled on each device
- Reminders that passed while the app was closed are shown once as "missed" at startup

### 4.8 Security
- Supabase Auth (email OTP / Google OAuth, PKCE + deep link `urinote://auth`)
- Refresh tokens in the OS secure store (Windows Credential Manager / Keychain / Android Keystore)
- RLS on every table; the `service_role` key is never included in the client
- Server data deleted by cascade when an account is deleted
- (P2) Locked notes: body encrypted with AES-GCM using a per-device key before syncing
- Content Security Policy: scripts only from the app bundle; no plugins, frames or forms
- Before migrations, the app backs up `urinote.db` once per app version change (latest 5 kept)
- Error log (`urinote.log`) records errors and context only, never note contents

---

### 4.9 Friend sharing (v1.1) — same Wi-Fi only, no server

**Decisions**: sharing model = **real-time co-editing**; transport = **direct device-to-device connections within the same Wi-Fi (local network)**; server/account = **none**; unit of sharing = one note (folder sharing in v1.2)

#### 4.9.1 At a glance
> Find a friend's device on the same Wi-Fi and add them as a friend with a **6-digit confirmation code**. When a note is shared and the friend accepts, the two of you **co-edit in real time while on the same Wi-Fi**. Changes made while apart **merge automatically when you meet again on the same Wi-Fi** (Yjs). Notes never pass through a server; they live **only on our own devices**.

| Can do | Cannot do (limits of this approach) |
|---|---|
| Real-time co-editing with friends on the same Wi-Fi, showing their cursor | Real-time editing with friends on another network |
| Edit separately offline → merge automatically when meeting | Deliver changes to a friend you never meet (relaying by another member is possible, 4.9.5) |
| Share with 3 or more people (up to 10 devices) | Auto-discovery on Wi-Fi that blocks device-to-device traffic (public Wi-Fi, some office networks) → manual connection instead (4.9.9) |
| Edit / view-only permissions, removing members | Recalling copies already handed over |

#### 4.9.2 Components
```
┌────────────── My PC (Urinote) ─────────────┐            ┌── Friend's PC ──┐
│ Hub window (JS)                             │            │                 │
│  ShareEngine: friends & members, permission │            │ (same layout)   │
│   checks, Yjs sync protocol, cursors        │            │                 │
│        ▲ Tauri command / event              │            │                 │
│ Rust: p2p module                            │  QUIC+TLS  │                 │
│  - iroh Endpoint (relays off)               │◀══════════▶│                 │
│  - mDNS discovery `_urinote._udp.local`     │ same Wi-Fi │                 │
│  - device key (OS secure store), sign/verify│            │                 │
└─────────────────────────────────────────────┘            └─────────────────┘
```
- **Rust** handles only the network: discovery, connections, sending/receiving messages (length-prefixed frames), signing/verification and storing the device key. It does not interpret note contents.
- **ShareEngine (JS)** runs once, in the hub window (single instance; the hub keeps running while hidden). It talks to sticky windows through the existing `doc:update` event.
  - Received update → stored in `note_doc_updates` with `origin='remote'` → `doc:update` (source=`p2p`) → applied live in hub and sticky editors → title/text cache recomputed
  - `doc:update` from my windows → sent to connected member devices
- There is **one connection per device pair**, carrying all shared notes between them.

#### 4.9.3 Device IDs and adding friends
- Each device creates an **Ed25519 key pair** on first run. The public key is the **device ID** and the secret key is kept in the OS secure store. There are no accounts.
- iroh connections use TLS to **verify that the peer holds the secret key of its device ID**, so the device ID of a connected peer cannot be forged.
- **Adding a friend (once)**:
  1. Both people open "Add a friend" → only then is a **display name** advertised over mDNS (normally only the device ID is advertised)
  2. A picks B from the list → B sees "Friend request from A"
  3. They exchange **random-value commitments, then reveal them** (Bluetooth numeric-comparison style), and both screens show the **6 digits** of `code = H(deviceID_A, deviceID_B, random_A, random_B)`
  4. Both people check that the codes match and press [Yes] → saved in `contacts`
  - Because commitments come first, a man in the middle cannot try different keys to make the codes match.
- If a friend uses several devices, **each device is added separately** (v1.2: grouping one person's devices).

#### 4.9.4 Sharing flow
1. **Start sharing**: note → [Share] → pick friend devices + permission (edit / view only)
   - My device creates **member list v1** and signs it. The note becomes shared (`notes.space_id = note_id`, a `shares` row is added)
   - A **share offer** (member list + title + full document state) for each friend goes into `share_outbox`
2. **Delivery**: the offer is sent the moment that friend's device connects on the same Wi-Fi (it waits until they meet)
3. **Accept**: the friend sees "A shared 'Groceries' with you [Decline] [Accept]" → accepting creates the note on their device and starts syncing → declining notifies A and removes them from A's member list
4. **Co-editing**: while member devices are connected, edits are sent immediately (target ≤ 300 ms) and the other person's cursor and name are shown
5. **Managing members (owner only)**: add members, change permissions, remove → sign a new member-list version → delivered to each member on connection (members also relay it to each other)
6. **Leave / end**: see 4.9.7

#### 4.9.5 Sync protocol
Messages exchanged right after connecting and afterwards (QUIC streams, ALPN `urinote/share/1`, up to 4 MB per message):

| Message | Contents | When |
|---|---|---|
| `hello` | app version, my shared notes and each member-list version | right after connecting |
| `membership` | signed member list (when newer than the peer's) | after comparing `hello`, on change |
| `offer` / `offer-reply` | share offer / accept or decline | when an offer is pending |
| `sync-step1` | note ID + my Yjs state vector | for each common shared note |
| `sync-step2` | the diff the peer lacks (`Y.encodeStateAsUpdate(doc, peer state vector)`) | on receiving step 1 |
| `update` | new edits (Yjs update) | on each edit (batched 200 ms) |
| `awareness` | cursor position (not stored, not relayed through other members) | while an editor is open (batched 80 ms) |
| `leave` | notice of leaving the share | when leaving |

- **Relaying through other members**: with members A, B and C, after A and B meet and sync, C receives A's edits when B later meets C. Yjs updates give the same result regardless of duplicates or order, so it does not matter who relays them.

#### 4.9.6 Permission rules
The member list has this format and is **signed with the owner's device key**:
```json
{ "noteId": "…", "version": 3, "owner": "<deviceID>", "status": "active",
  "members": [ { "id": "<deviceID>", "name": "Minji PC", "role": "owner" },
               { "id": "<deviceID>", "name": "Junho laptop", "role": "editor" },
               { "id": "<deviceID>", "name": "Seoyeon phone", "role": "viewer" } ],
  "issuedAt": 1730100000000 }
```
- A member list is accepted **only if it is signed by the owner and has a higher version** → it cannot be forged even when relayed through other members.
- Each device decides using **the newest member list it knows**:
  - **Document data (`sync-step2`, `update`) is accepted only from owner and editor devices.** Data sent by view-only devices is dropped. The peer's device ID is verified by TLS and cannot be faked.
  - Document data is sent only to devices on the member list (including view-only). Devices removed from the list are no longer synced for that note.
  - On view-only devices the editor is read-only.
- Since editor devices never accept data from view-only devices, relayed documents only contain edits by members with edit permission.
- **Gap while changes propagate**: after a removal, devices that have not received the new member list yet may keep syncing with the removed device. The UI explains this as "changes may not apply until they reach every member".

#### 4.9.7 Trash and deletion rules (shared notes)
| Action | Result |
|---|---|
| Move to trash | **Hidden only for me.** Syncing continues and it can be restored |
| Delete forever (member) | **Leave the share**: `leave` sent to other members → the owner's device drops me from the next member list → deleted on my device |
| Delete forever (owner) | **End sharing**: a member list with `status: "ended"` is signed and sent → other members' copies become personal notes with a notice (delete them as usual if wanted) |
| Auto-deleting empty notes | Not applied to shared notes (protects an empty note a friend just created) |
| Personal settings (color, pin, folder, reminder, sticky position) | Not shared; separate per person |

- If the owner loses their device, the member list can no longer be changed (editing continues). Ownership transfer is v1.2.

#### 4.9.8 What is protected (threat model)
| Who | Can see | Cannot do |
|---|---|---|
| Others on the same Wi-Fi | That a Urinote device exists, its device ID (and display name while in Add-a-friend mode) | Read notes (TLS encryption), pose as a friend (device ID + confirmation code) |
| View-only members | Shared note contents | Edit (rejected by every device) |
| Removed members | What they received before removal (cannot be recalled) | Receive later changes (from devices that have the new list) |
| Someone who finds a lost device | Notes on the device (relies on OS login protection; note lock is v1.2) | – → other members remove that device |
| Server / operator | **Not applicable (no server)** | – |

#### 4.9.9 Network limits and responses
- **Networks where discovery fails** (client isolation on public Wi-Fi, blocked mDNS): in Add a friend, **copy a connection code (device ID + local address), exchange it via a messenger** and paste it to connect directly. On mobile (M4) the same information is shown as a QR code and read with the camera. Networks that block device-to-device traffic entirely cannot share.
- **Firewall**: Windows shows an "allow on private networks" prompt on first run. The installer adds a firewall rule for private networks; off by default on public networks. On macOS the user allows "Local Network" access on first run (Info.plist declares `_urinote._udp`).
- **Mobile**: connects and syncs only while the app is open on screen (from M4).
- **Abuse limits**: 4 MB per message, a per-device message rate limit, 10 devices per shared note, and connections from non-friend devices accepted only in Add-a-friend mode. Share messages from non-friend devices connected in that mode are dropped. Unanswered share offers are capped at 10 per friend and 50 in total.
- **Cursors (S4)**: each window's cursor goes through the hub only to directly connected members (including view-only). The hub checks received cursors:
  - at most 16 KB per message, 8 entries, and 8 cursors per friend device per note
  - a cursor ID belongs to the device that first sent it → nobody can move or remove another friend's or my own window's cursor
  - fields other than the cursor position are dropped; name and color are taken from my friend list and the device ID (prevents name spoofing)
  - a friend's cursor is removed immediately on disconnect (otherwise it disappears after 30 s without updates)

#### 4.9.10 Review findings on the previous design (v0.2, server relay)
| # | Finding | In this design |
|---|---|---|
| 1 | The server could inject fake device keys | **N/A** — no server; devices are added only via confirmation codes |
| 2 | A shared symmetric key cannot identify the sender | **Resolved** — peers verified by TLS + permission checks on signed member lists (4.9.6) |
| 3 | Anyone with an invite link ID could become a member | **N/A** — no invite links; offers go directly to friend devices |
| 4 | Only the author uploads, so content can be lost | **Resolved** — any member relays via Yjs sync (4.9.5) |
| 5 | Key rotation after removing a member | **N/A** — no shared key; removed devices are not synced even if connected |
| 6 | Server compaction races | **N/A** — local compaction only (M3a, hub only) |
| 7 | Unclear meaning of trash and deletion | **Resolved** — 4.9.7 |
| 8 | Plaintext stored on the server when switching to shared | **Resolved** — shared notes are excluded from server sync (M3b) |
| 9 | Unclear connection unit | **Resolved** — one connection per device pair, up to 10 devices |
| 10 | No threat model | **Resolved** — 4.9.8 |
| 11 | Key storage and recovery | **Resolved** — OS secure store. If every device is lost, add the new device as a friend again and have the owner add it as a member |
| 12 | Abuse prevention | **Resolved** — 4.9.9 |
| extra | Brute-forcing the confirmation code (changing keys to produce the same code) | **Resolved** — commit, then reveal random values (4.9.3) |

---

## 5. Screen design

### 5.1 Design principles
- Soft pastel colors with a paper feel, generous spacing
- The note color is the UI theme (the sticky window's top bar and toolbar follow the note color)
- In dark mode colors switch automatically to lower-saturation tones

### 5.2 Desktop screens

**Sticky note window**
```
┌──────────────────────────────┐
│ +                    ⋯    ×  │ ← drag area (note color); ⋯: color, always on top, opacity, reminder, delete
├──────────────────────────────┤
│ Groceries                     │
│ ☐ Milk                        │
│ ☑ Eggs                        │
│                              │
├──────────────────────────────┤
│ B  I  U  S  •  ☐              │ ← shown only while focused
└──────────────────────────────┘
```

**Hub (list) window**
```
┌───────────────────────────────────────────┐
│ Urinote                        👥  ⚙  +   │
│ [🔍 Search                            ]   │
│ All · Pinned · Trash                       │
│ All folders · Work · Personal · + Folder   │
├───────────────────────────────────────────┤
│ ▌Groceries            10:21 AM            │
│ ▌Milk, eggs …                             │
│ ▌Meeting notes        Yesterday           │
│ ▌Q3 goals …                               │
└───────────────────────────────────────────┘
      (double-click → open as a sticky window)
```

### 5.3 Mobile screens
```
┌──────────────────┐   ┌──────────────────┐
│ Urinote   🔍  ⚙  │   │ ‹        🎨 ⏰ ⋯ │
│ All Work Personal│   │ Groceries        │
│ ┌──────┐┌──────┐ │   │ ☐ Milk           │
│ │Groc. ││Meet. │ │   │ ☑ Eggs           │
│ │Milk… ││Goals…│ │   │                  │
│ └──────┘└──────┘ │   │                  │
│ ┌──────┐         │   │                  │
│ │Ideas │       ⊕ │   │ B I U • ☐        │
│ └──────┘         │   └──────────────────┘
└──────────────────┘       editor
    list (grid)
```

### 5.4 Key user flows
1. **First run**: welcome → "Start without signing in" or "Sign in and sync" → one sample note
2. **Quick note (desktop)**: `Ctrl+Alt+N` → new sticky window near the cursor → type → saved automatically
3. **Continue on mobile**: open the app → the note written on the PC is at the top → edit → reflected in the PC sticky window immediately
4. **Share with a friend (same Wi-Fi)**:
   ```
   ① Add a friend             ② Share a note               ③ Friend's screen            ④ Edit together
   ┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
   │ Urinote nearby   │   │ Share 'Groceries'    │   │ Minji PC shared      │   │ Groceries  👥 2  ● on │
   │ ○ Junho laptop ▶ │   │ ☑ Junho laptop [Edit▾]│   │ 'Groceries' with you │   │ ☐ Milk               │
   │ ○ Seoyeon PC   ▶ │   │ ☐ Seoyeon PC  [View▾]│   │                      │   │ ☑ Eggs ▏Junho        │
   │──────────────────│   │                      │   │  [Decline] [Accept]  │   │                      │
   │ Code 482 913     │   │ Delivered when you   │   └──────────────────────┘   └──────────────────────┘
   │ Same as theirs?  │   │ meet on Wi-Fi [Share]│                               ● on = live now
   │   [No]   [Yes]   │   └──────────────────────┘                               ○ away = merges when you meet
   └──────────────────┘
   ```
   - The note list and sticky header show shared notes (👥 member count) and connection status (● live / ○ merges when you meet)

---

## 6. Quality assurance

| Level | Scope | Tools |
|---|---|---|
| Unit | Domain services, Yjs merge/compaction, migration of old notes, sharing engine, cursors, reminders, backup, i18n coverage | Vitest, `cargo test` |
| Component | Editor, list, color picker | Testing Library |
| Integration | LocalRepo ↔ SyncEngine ↔ Supabase (local `supabase start`) | Vitest + Docker |
| E2E | Note persistence across restarts, search, trash/restore, folders, language switch, sticky window sync (`uri-memo/e2e`) | WebdriverIO + tauri-driver (Windows locally, Ubuntu in CI) |
| Manual | Multiple monitors, real mobile devices, notifications, each desktop OS | checklist |

**Core sync test scenarios**
- Two offline devices edit different lines and the same line of a note → back online → both edits remain and both sides end up identical
- Typing in the same note in the hub and a sticky window on one PC → both windows match, and it persists after restart
- A deletes while B edits → the edit is kept (restored)
- Duplicate or reordered updates → same result (idempotency)
- First sync of 1,000 notes → done within 30 s

**Sharing test scenarios (v1.1, 2–3 PCs on the same Wi-Fi)**
- Add a friend: the 6-digit codes match on both screens → added. If either side presses [Cancel], nothing is added
- Share offer → accept → the note appears on the other device within 3 s; later edits arrive within 300 ms; cursor shown
- Disconnect Wi-Fi and edit on both sides → reconnect → both edits applied and both sides identical
- A·B sync → B·C sync (A absent) → A's edits reach C (relayed by a member)
- A view-only device sends a tampered `update` → every device rejects it; the document is unchanged
- Forged member list (bad signature or lower version) → rejected
- Removed device → no longer synced with devices that received the new list
- Owner ends sharing → other members see a notice and keep a personal copy
- A non-friend device tries to connect → rejected unless in Add-a-friend mode
- Packet capture shows no plaintext note contents

---

## 7. Development plan

### 7.1 Schedule (one developer; v1.0 about 13 weeks + friend sharing (S1–S4) about 3.5 weeks)

| Stage | Time | Main work | Definition of done |
|---|---|---|---|
| **M0. Environment** ✅ | week 1 | Rust/Tauri 2, React+TS+Vite, ESLint/Prettier, Git, CI | Empty desktop app runs (Android check moved to M4) |
| **M1. Local notes** ✅ | weeks 2–3 | SQLite migrations, LocalRepo, NoteService, hub list, TipTap editor, auto-save, colors, pin, FTS search, trash | Offline CRUD and search work, unit tests pass |
| **M2. Sticky windows** ✅ | weeks 4–5 | Multi-window, save/restore window state, always on top / opacity / collapse, tray, global shortcuts, autostart, cross-window events | Sticky windows return to their positions after reboot |
| **M3a. Switch to Yjs (local)** ✅ | week 6 | `0002_yjs.sql`, document store (snapshot + update log), TipTap Collaboration binding, live cross-window merging via `doc:update`, migration of old notes, local compaction | Hub and sticky edits merge live; old notes migrated without loss |
| **M3b. Accounts & sync** ⏸ on hold | (after the server decision) | Supabase schema/RLS, Auth (email/Google, deep link), SyncEngine (push/pull/realtime of doc updates, metadata LWW), server snapshot compaction, status display | Two PCs edit offline at the same time and merge; changes appear within 3 s |
| **M4. Mobile** (M4a ✅ Android build, mobile layout and back navigation, scheduled reminders, insets/keyboard; M4b: P2P sharing, backup, real device) | weeks 10–11 | Android build, mobile layout, touch-friendly editor, receive shares, secure storage | Phone ↔ PC verified on real devices |
| **M5. Reminders, folders, settings** ✅ (M5a folders & settings / M5b reminders / M5c export & i18n) | week 12 | Reminder scheduling / missed reminders, folders, theme / font size, JSON export/import, i18n | Reminders fire on time; settings persist |
| **M6. Stabilization & release** (in progress: CSP, update backup, error log, temporary icon, release workflow for Windows/macOS/Ubuntu) | week 13 | E2E, performance, icon/branding, code signing, auto-update, MSI/DMG/DEB/APK, store materials | v1.0 release candidate |
| **S1. P2P transport (Rust)** ✅ (2-PC field test pending) | no server needed, can precede M4; 1 week | iroh Endpoint (relays off) + mDNS discovery, device key (keyring), connection acceptance policy, message framing, sign/verify commands, firewall rule | Two PCs on the same Wi-Fi discover and connect to each other, messages round-trip |
| **S2. Adding friends** ✅ (2-PC field test pending) | 0.5 week | Add-a-friend screen, commit-reveal 6-digit code, `contacts` (`0003_contacts.sql`), manual connection code | "Add a friend" test scenario passes |
| **S3. Sharing & sync** ✅ (2-PC field test pending) | 1.5 weeks | `0004_shares.sql`, ShareEngine (hello/membership/offer/sync/update), signed member lists, permission rules, trash/leave/end, sharing UI (members, permissions) | Sharing test scenarios in 4.9 pass |
| **S4. Cursors & polish** ✅ (2-PC field test pending) | 0.5 week | Awareness (cursors, names), connection status, abuse limits | Live cursors; limits enforced |
| **v1.2+** | later | Note lock, iOS release, folder sharing, end-to-end encryption of the personal space, calendar/D-Day, images and screen capture | – |

### 7.2 Milestone deliverables
- **M1 demo**: single-window local notebook
- **M2 demo (internal alpha)**: desktop sticky notes (no sign-in) → collect real-use feedback
- **M3 demo (beta)**: sync across PCs (automatic merging)
- **M6**: v1.0 (Windows, macOS, Ubuntu, Android)
- **v1.1**: co-editing with friends on the same Wi-Fi (no server)

### 7.3 Branching and releases
- `main` (release) / `develop` / `feature/*`, merged after PR review
- Versioning: SemVer. Pushing a `v*` tag makes GitHub Actions build installers for each platform into a draft release (`.github/workflows/release.yml`)
- Desktop auto-update: `tauri-plugin-updater` + GitHub Releases

---

## 8. Risks

| Risk | Impact | Response |
|---|---|---|
| Maturity of Tauri mobile plugins | Mobile schedule slips | Verify the Android build early; switch to Capacitor if it fails (Plan B) |
| Data loss from sync bugs | Fatal to trust | CRDT merging, append-only update log, tombstones, trash, DB backup before migrations, sync scenario tests written first |
| Growth of Yjs documents and update logs | Storage and load time | Snapshot compaction (local 50 / server 200 updates), GC of old tombstones |
| Wi-Fi that blocks device-to-device traffic (public, corporate) | Sharing does not work | Manual connection codes/QR work around discovery; explain blocked traffic in the UI |
| Friends rarely meet on the same Wi-Fi | Changes arrive late | Relaying via members; the transport layer is separated so a server relay can be added later as an option |
| Frequent iroh version changes | Upgrade cost | Pin versions; isolate the transport in one Rust module (alternative: libp2p) |
| Owner loses their device | Member list cannot change | Editing continues; ownership transfer in v1.2 |
| Shared notes cannot be recalled | User misunderstanding | State "copies already received cannot be recalled" when sharing and removing |
| Per-OS differences in transparent/frameless windows | Broken UI | Manual tests on Windows/macOS/Ubuntu; fall back to opaque if transparency is unsupported. Per-OS differences in the README (Wayland: global shortcuts and window positions limited) |
| Cost and process of code signing | Install warnings (SmartScreen, Gatekeeper) | Get a Windows signing certificate early; macOS notarization |
| iOS requirements (a Mac, $99/year developer account) | iOS delayed | v1.0 ships Windows/macOS/Ubuntu/Android; iOS in v1.2 |
| Supabase free-tier limits | Service interruption | Monitor usage; define the paid-plan threshold in advance |
| In English, "Uri-" may evoke "urine" | International perception | Consider writing the logo and name as **"Uri Note / 우리노트"** |

---

## 9. Open questions

| # | Item | Current assumption | Decide by |
|---|---|---|---|
| 1 | App shell | ✅ Tauri 2 (Plan B: Capacitor) | – |
| 2 | Sync backend | ⏸ on hold (Supabase skipped). Sync between my own devices proceeds once a server is chosen | before M3b |
| 3 | Sync method | ✅ Yjs (CRDT) | – |
| 4 | Sharing model and transport | ✅ real-time co-editing + **serverless P2P on the same Wi-Fi** | – |
| 5 | iOS release timing | v1.2 | before M4 |
| 6 | Use without signing in | ✅ allowed. Friend sharing also needs no sign-in (device-ID based) | – |
| 7a | P2P library | iroh (alternative libp2p) — verify Windows firewall and mDNS behavior first in S1 | at S1 |
| 7b | Syncing my own devices over the same Wi-Fi | The same P2P layer could sync all notes once a device is registered as "mine" (a serverless alternative to M3b) — scope to be decided | after S3 |
| 7 | Trademark and domain | Check `urinote` trademark (class 9), domain and store availability | before M6 |
| 8 | App ID | ✅ `kr.urinote.app` | – |
| 9 | License | ✅ MIT. Third-party license notices still to be added | before the first release |
| 10 | Business model | Free (possible premium later: attachment storage, lock, more share members) | v1.1 |
