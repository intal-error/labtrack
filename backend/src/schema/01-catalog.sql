DROP TABLE IF EXISTS catalog CASCADE;

CREATE TABLE catalog (
  id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  category TEXT,
  course TEXT,
  quantity INTEGER DEFAULT 0,
  available_quantity INTEGER DEFAULT 0,
  available BOOLEAN DEFAULT true,
  condition TEXT,
  status TEXT DEFAULT 'Available',
  image_url TEXT,
  barcode TEXT,
  asset_tag TEXT,
  created_by_admin_id TEXT,
  created_by_admin_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_status ON catalog(status);
CREATE INDEX IF NOT EXISTS idx_catalog_course ON catalog(course);
CREATE INDEX IF NOT EXISTS idx_catalog_barcode ON catalog(barcode);
