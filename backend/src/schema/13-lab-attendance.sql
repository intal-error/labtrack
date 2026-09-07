DROP TABLE IF EXISTS lab_attendance CASCADE;

CREATE TABLE lab_attendance (
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

CREATE INDEX IF NOT EXISTS idx_lab_attendance_date ON lab_attendance(date);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student ON lab_attendance(student_school_id);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_date_status ON lab_attendance(date, status);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student_date ON lab_attendance(student_school_id, date);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_room ON lab_attendance(room_code);
