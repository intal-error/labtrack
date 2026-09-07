DROP TABLE IF EXISTS maintenance CASCADE;

CREATE TABLE maintenance (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date TEXT,
  type TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  assigned_to TEXT,
  catalog_id TEXT,
  item_name TEXT,
  photo_url TEXT,
  college_building TEXT,
  location TEXT,
  findings TEXT,
  recommendation TEXT,
  materials_needed TEXT,
  estimated_days TEXT,
  date_started TEXT,
  date_finished TEXT,
  remarks TEXT,
  inspected_by TEXT,
  noted_by TEXT,
  inspected_date TEXT,
  assigned_personnel TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_created ON maintenance(created_at DESC);
