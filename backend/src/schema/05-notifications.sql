DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  title TEXT,
  message TEXT,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed_by TEXT[] DEFAULT '{}',
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_created ON notifications(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_read ON notifications(target_user_id, read);
