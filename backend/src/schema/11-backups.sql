DROP TABLE IF EXISTS backups CASCADE;

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  total_documents INTEGER,
  collections TEXT[],
  created_by TEXT,
  type TEXT,
  imported INTEGER,
  skipped INTEGER,
  overwrite BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
