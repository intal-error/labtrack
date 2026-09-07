DROP TABLE IF EXISTS borrow_requests CASCADE;

CREATE TABLE borrow_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  school_id TEXT,
  first_name TEXT,
  last_name TEXT,
  course TEXT,
  year TEXT,
  email TEXT,
  role TEXT,
  catalog_id TEXT,
  item_name TEXT,
  quantity INTEGER DEFAULT 1,
  due_date TIMESTAMPTZ,
  purpose TEXT,
  status TEXT DEFAULT 'pending',
  target_course TEXT,
  equipment_course TEXT,
  equipment_category TEXT,
  assigned_admin_id TEXT,
  assigned_admin_name TEXT,
  reassignment_history JSONB DEFAULT '[]',
  reviewed_by TEXT,
  reviewer_name TEXT,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_borrow_requests_status ON borrow_requests(status);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_user ON borrow_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_created ON borrow_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_course ON borrow_requests(target_course);
