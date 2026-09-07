-- LabTrack Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

-- Equipment inventory
CREATE TABLE IF NOT EXISTS catalog (
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

-- Borrow/return records
CREATE TABLE IF NOT EXISTS transactions (
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

-- Student borrow requests
CREATE TABLE IF NOT EXISTS borrow_requests (
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

-- Financial penalties
CREATE TABLE IF NOT EXISTS fines (
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

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
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

-- Uploaded documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  size TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lab manuals
CREATE TABLE IF NOT EXISTS manuals (
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

-- Equipment maintenance
CREATE TABLE IF NOT EXISTS maintenance (
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

-- Incident reports
CREATE TABLE IF NOT EXISTS incidents (
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

-- App settings (single row)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'appSettings',
  email_notifications BOOLEAN DEFAULT true,
  auto_backup BOOLEAN DEFAULT true,
  maintenance_mode BOOLEAN DEFAULT false,
  allow_student_registration BOOLEAN DEFAULT true,
  require_password_change BOOLEAN DEFAULT false,
  session_timeout INTEGER DEFAULT 30,
  max_login_attempts INTEGER DEFAULT 5,
  default_role TEXT DEFAULT 'Student',
  fine_per_day NUMERIC(10,2) DEFAULT 5,
  fine_restriction_threshold NUMERIC(10,2) DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup metadata
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  total_documents INTEGER,
  collections TEXT[],
  created_by TEXT,
  type TEXT,
  imported INTEGER,
  skipped INTEGER,
  overwrite BOOLEAN
);

-- Lab room definitions
CREATE TABLE IF NOT EXISTS lab_rooms (
  id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL,
  room_code TEXT UNIQUE,
  qr_data TEXT,
  location TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student attendance
CREATE TABLE IF NOT EXISTS lab_attendance (
  id TEXT PRIMARY KEY,
  student_school_id TEXT NOT NULL,
  user_id TEXT,
  first_name TEXT,
  last_name TEXT,
  school_id TEXT,
  course TEXT,
  year TEXT,
  section TEXT,
  subject TEXT,
  professor TEXT,
  lab_room TEXT,
  room_code TEXT,
  date DATE NOT NULL,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  total_duration INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_action ON transactions(action);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_action_user ON transactions(action, user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_catalog_id ON transactions(catalog_id);
CREATE INDEX IF NOT EXISTS idx_transactions_original ON transactions(original_transaction_id);

CREATE INDEX IF NOT EXISTS idx_borrow_requests_status ON borrow_requests(status);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_user ON borrow_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_created ON borrow_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_course ON borrow_requests(target_course);

CREATE INDEX IF NOT EXISTS idx_fines_user ON fines(user_id);
CREATE INDEX IF NOT EXISTS idx_fines_status ON fines(status);
CREATE INDEX IF NOT EXISTS idx_fines_transaction ON fines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fines_created ON fines(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_created ON notifications(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_read ON notifications(target_user_id, read);

CREATE INDEX IF NOT EXISTS idx_lab_attendance_date ON lab_attendance(date);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student ON lab_attendance(student_school_id);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_date_status ON lab_attendance(date, status);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student_date ON lab_attendance(student_school_id, date);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_room ON lab_attendance(room_code);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_created ON maintenance(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_status ON catalog(status);
CREATE INDEX IF NOT EXISTS idx_catalog_course ON catalog(course);
CREATE INDEX IF NOT EXISTS idx_catalog_barcode ON catalog(barcode);

CREATE INDEX IF NOT EXISTS idx_manuals_created ON manuals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
