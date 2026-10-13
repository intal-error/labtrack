-- 22-safety-rules.sql
--
-- Safety Rules: course-scoped laboratory safety instructions, replacing the Laboratory
-- Manuals module in the UI.
--
-- !! NOT APPLIED. This file is written for review only. It has NOT been run against any
-- !! database. Applying it requires separate approval.
--
-- WHY A NEW TABLE RATHER THAN REUSING `manuals`
--
-- `manuals.course` is NULLABLE, and in practice most existing rows have it empty. A row
-- with no owner resolves to "no course in scope" and is therefore visible to the Super
-- Admin ONLY -- so the module could never be scoped correctly for Course Admins without
-- first backfilling ownership, which is guesswork on rows nobody has audited.
--
-- `safety_rules.course` is NOT NULL and REFERENCES courses(id). Ownership is correct from
-- the first row, so there is never a legacy-shaped row to fix later.
--
-- THE EXISTING `manuals` TABLE IS DELIBERATELY LEFT ALONE. Its rows and their Cloudinary
-- files stay exactly as they are. Converting them is a separate decision recorded in
-- docs/migrations/manuals-to-safety-rules-conversion.md, which is also not executed.
--
-- FILE STORAGE COLUMNS
--
-- `file_public_id` is the Cloudinary public id, NOT a delivery URL. The application is
-- expected to store and only ever serve `public_id`; the frontend receives bytes through
-- GET /api/safety-rules/:id/file and never sees a res.cloudinary.com URL.
--
-- CAVEAT, and it is a real one: assets created through the existing UNSIGNED upload
-- preset are PUBLIC in Cloudinary. Any such URL that has already been handed out stays
-- fetchable by whoever holds it, and this table cannot revoke that. Closing it fully
-- requires authenticated assets plus signed URLs, which needs CLOUDINARY_API_SECRET --
-- a production configuration change. See docs/known-issues/safety-rules-file-access.md.
--
-- NOTE ON EXISTING FILE URLS: `file_url` exists only so a row migrated from `manuals`
-- (never done) could keep a reference. New rows should leave it NULL.

BEGIN;

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_rules (
  id TEXT PRIMARY KEY,

  title TEXT NOT NULL,

  -- Every rule belongs to a course. NOT NULL, unlike manuals.course, so that a Course
  -- Admin's scope can never silently exclude rows they are meant to see.
  course TEXT NOT NULL REFERENCES courses(id),

  description TEXT,
  lab_room TEXT,
  status TEXT NOT NULL DEFAULT 'Active',

  -- Cloudinary public id, served through the authorised proxy. No delivery URL.
  file_public_id TEXT,
  file_format TEXT,

  -- Legacy-only: retained so a future, separately-approved conversion of `manuals` rows
  -- has somewhere to keep its original reference. New rows leave it NULL.
  file_url TEXT,

  file_name TEXT,
  file_size TEXT,
  file_type TEXT,
  thumbnail_url TEXT,

  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The list endpoint is always filtered by course, for every role, including the Super
-- Admin's unfiltered case (which skips the filter but still benefits on the Admin side).
CREATE INDEX IF NOT EXISTS idx_safety_rules_course ON safety_rules(course);

-- Supports the "active rules for this room" lookup used by the lab QR flow later.
CREATE INDEX IF NOT EXISTS idx_safety_rules_room ON safety_rules(lab_room);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFICATION (read-only, safe to run any time)
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_name IN ('courses','manuals','safety_rules');
--
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_name = 'safety_rules' AND column_name = 'course';
-- expect is_nullable = 'NO'
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'safety_rules';
-- expect idx_safety_rules_course and idx_safety_rules_room
--
-- ROLLBACK PLAN
-- ------------
-- DROP TABLE IF EXISTS safety_rules;   -- drops the two indexes with it
-- Nothing else is touched: `manuals` and its rows are never read or written by this
-- migration, so reverting removes only the new table.