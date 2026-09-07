DROP TABLE IF EXISTS manuals CASCADE;

CREATE TABLE manuals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  course TEXT,
  lab_room TEXT,
  status TEXT DEFAULT 'Active',
  file_url TEXT,
  file_name TEXT,
  file_size TEXT,
  file_type TEXT,
  thumbnail_url TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manuals_created ON manuals(created_at DESC);
