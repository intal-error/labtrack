DROP TABLE IF EXISTS incidents CASCADE;

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  category TEXT,
  description TEXT,
  severity TEXT DEFAULT 'low',
  reported_by TEXT,
  reporter_name TEXT,
  reporter_role TEXT,
  status TEXT DEFAULT 'open',
  assigned_to TEXT,
  resolution TEXT,
  item_name TEXT,
  catalog_id TEXT,
  photos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
