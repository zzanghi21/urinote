-- 친구 공유 S3 (DESIGN.md 4.9.4 ~ 4.9.7). 모두 기기 안에만 있다.

-- 공유 중인 메모. 공유 메모는 모든 멤버 기기에서 같은 note_id 를 쓰고 notes.space_id = note_id 로 표시한다.
CREATE TABLE shares (
  note_id     TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,            -- 소유자 기기 ID
  membership  TEXT NOT NULL,            -- 서명된 멤버 목록 JSON
  signature   TEXT NOT NULL,            -- base64, 소유자 기기 키 서명
  version     INTEGER NOT NULL,
  status      TEXT NOT NULL             -- 'active' | 'ended' (소유자가 종료) | 'left' (내가 나감)
);

-- 받았지만 아직 수락·거절하지 않은 공유 제안
CREATE TABLE share_inbox (
  note_id     TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL,
  payload     TEXT NOT NULL,            -- offer 메시지 JSON
  received_at INTEGER NOT NULL
);

-- 아직 만나지 못한 기기에게 보낼 메시지 (공유 제안, 나가기 알림)
CREATE TABLE share_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  note_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- 'offer' | 'leave' | 'offer-reply'
  payload     TEXT NOT NULL,            -- 메시지 JSON
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_share_outbox_device ON share_outbox (device_id);
