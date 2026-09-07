DROP TABLE IF EXISTS documents CASCADE;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  size TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
