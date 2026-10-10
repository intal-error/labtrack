-- A "course" in LabTrack is a PROGRAM: one that owns its own students,
-- equipment catalog, laboratory rooms and administrator.
--
-- It maps 1:1 onto the program code that ALREADY exists in the `course` column
-- of catalog, transactions.course / transactions.equipment_course,
-- incidents.reporter_course, lab_attendance.course, and on the Firestore user
-- profile. That is deliberate: scoping a query is then a single equality match
-- (`.in("course", ["CT"])`) rather than a join against a mapping table, and no
-- existing table needs a backfill.
--
-- NOT "DROP TABLE IF EXISTS": files 01-13 drop because they are clean-slate
-- definitions of tables that hold no hand-curated data. This one holds live
-- rows the Super Admin edits at runtime (rename, deactivate), so re-running this
-- file must not destroy them.
--
-- `id` is the frozen join key and is NEVER regenerated on rename -- the same
-- convention lab_rooms.room_code already follows, and the reason
-- scripts/check-room-courses.js exists. Renaming a course writes `name` only.

CREATE TABLE IF NOT EXISTS courses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed. ON CONFLICT DO NOTHING rather than DO UPDATE: a seed must not be able to
-- clobber runtime data, exactly as a room rename must not regenerate room_code.
-- To correct a name later, issue a targeted UPDATE or edit it in the admin UI.
INSERT INTO courses (id, name) VALUES
  ('BIT', 'Bachelor of Industrial Technology'),
  ('CT',  'Computer Technology'),
  ('CPT', 'Computer Programming'),
  ('AT',  'Automotive Technology'),
  ('CTV', 'Civil Technology'),
  ('ELT', 'Electrical Technology'),
  ('ELX', 'Electronics Technology'),
  ('FSM', 'Food & Service Management'),
  ('MT',  'Mechanical Technology')
ON CONFLICT (id) DO NOTHING;