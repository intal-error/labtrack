DROP TABLE IF EXISTS settings CASCADE;

CREATE TABLE settings (
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
