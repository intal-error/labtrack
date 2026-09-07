DROP TABLE IF EXISTS transactions CASCADE;

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  catalog_id TEXT,
  item_name TEXT,
  action TEXT NOT NULL,
  status TEXT,
  quantity INTEGER DEFAULT 1,
  returned_quantity INTEGER DEFAULT 0,
  quantity_remaining INTEGER,
  school_id TEXT,
  first_name TEXT,
  last_name TEXT,
  course TEXT,
  year TEXT,
  email TEXT,
  equipment_course TEXT,
  assigned_admin_id TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  borrowed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  last_returned_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  timestamp TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  original_transaction_id TEXT,
  returned_to TEXT,
  scan_code TEXT,
  profile_url TEXT,
  borrow_photo_url TEXT,
  return_photo_url TEXT,
  condition_on_borrow TEXT,
  condition_on_return TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_action ON transactions(action);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_action_user ON transactions(action, user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_catalog_id ON transactions(catalog_id);
CREATE INDEX IF NOT EXISTS idx_transactions_original ON transactions(original_transaction_id);
