-- 친구 공유 S2: 확인 코드로 등록한 친구 기기 (DESIGN.md 4.9.3). 기기 안에만 있다.
CREATE TABLE contacts (
  device_id   TEXT PRIMARY KEY,         -- iroh 기기 ID (Ed25519 공개키, hex)
  name        TEXT NOT NULL,            -- 표시 이름 (상대가 알려 준 이름, 내가 바꿀 수 있음)
  paired_at   INTEGER NOT NULL,
  last_seen   INTEGER
);
