DROP TABLE IF EXISTS fines CASCADE;

CREATE TABLE fines (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  transaction_id TEXT,
  item_name TEXT,
  days_overdue INTEGER DEFAULT 0,
  fine_per_day NUMERIC(10,2) DEFAULT 0,
  total_fine NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  waived_by TEXT,
  waive_reason TEXT,
  waived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fines_user ON fines(user_id);
CREATE INDEX IF NOT EXISTS idx_fines_status ON fines(status);
CREATE INDEX IF NOT EXISTS idx_fines_transaction ON fines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fines_created ON fines(created_at DESC);
