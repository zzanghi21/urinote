CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  folder_id   TEXT,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  plain_text  TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'yellow',
  pinned      INTEGER NOT NULL DEFAULT 0,
  remind_at   INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  rev         INTEGER NOT NULL DEFAULT 0,
  dirty       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_notes_updated ON notes (deleted_at, pinned, updated_at);

CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, plain_text,
  content = 'notes', content_rowid = 'rowid',
  tokenize = 'trigram'
);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts (rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
END;

CREATE TRIGGER notes_au AFTER UPDATE OF title, plain_text ON notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
  INSERT INTO notes_fts (rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
END;

CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  rev         INTEGER NOT NULL DEFAULT 0,
  dirty       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sticky_windows (
  note_id        TEXT PRIMARY KEY,
  x              INTEGER,
  y              INTEGER,
  w              INTEGER,
  h              INTEGER,
  opacity        REAL NOT NULL DEFAULT 1.0,
  always_on_top  INTEGER NOT NULL DEFAULT 0,
  collapsed      INTEGER NOT NULL DEFAULT 0,
  is_open        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
