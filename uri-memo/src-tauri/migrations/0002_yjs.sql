-- 메모 본문을 Yjs 문서로 저장한다. notes.content(TipTap JSON)는 기존 메모 변환에만 쓰고 이후 비워 둔다.

ALTER TABLE notes ADD COLUMN space_id TEXT;

-- 압축된 문서 상태
CREATE TABLE note_docs (
  note_id     TEXT PRIMARY KEY,
  snapshot    TEXT NOT NULL,            -- base64(Yjs 업데이트: 압축 시점까지의 전체 상태)
  synced_sv   TEXT,                     -- base64(서버가 가진 상태 벡터), M3b 동기화에서 사용
  updated_at  INTEGER NOT NULL
);

-- 스냅샷 이후의 업데이트. 추가만 하므로 여러 창이 동시에 써도 유실되지 않는다.
CREATE TABLE note_doc_updates (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     TEXT NOT NULL,
  data        TEXT NOT NULL,            -- base64(Yjs 업데이트)
  origin      TEXT NOT NULL,            -- 'local' | 'remote'
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_doc_updates_note ON note_doc_updates (note_id, seq);

-- 메모를 영구 삭제하면 문서도 지운다
CREATE TRIGGER notes_delete_doc AFTER DELETE ON notes BEGIN
  DELETE FROM note_docs WHERE note_id = old.id;
  DELETE FROM note_doc_updates WHERE note_id = old.id;
END;
