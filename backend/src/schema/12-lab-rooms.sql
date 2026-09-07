DROP TABLE IF EXISTS lab_rooms CASCADE;

CREATE TABLE lab_rooms (
  id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL,
  room_code TEXT UNIQUE,
  qr_data TEXT,
  location TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
