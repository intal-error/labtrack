-- Incident reports -> course-handler review workflow
-- Run in the Supabase SQL Editor. Idempotent (IF NOT EXISTS), so re-running is safe.
--
-- Why these columns: an incident is filed by a student against a borrowed item and
-- is handled by whoever is responsible for that student's course. Before this,
-- `incidents` was a flat lab log with no course, no assignee (the `assigned_to`
-- column existed but nothing ever wrote it) and a single overwritten `resolution`.

-- ── Reporter context ──
-- Captured server-side from the Firestore users/{uid} doc at creation time so a
-- report stays attributable even if the student is later edited or deactivated.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reporter_school_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reporter_course TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reporter_year TEXT;

-- ── Item context ──
-- The course that owns the equipment, kept separate from reporter_course. The
-- two can differ (a student in one course borrows another course's gear) and the
-- handler needs to see that before deciding who absorbs the loss.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS item_course TEXT;

-- When the incident actually happened, as opposed to created_at (when it was
-- filed). Students often report the next day.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_date DATE;

-- ── Handler assignment ──
-- assigned_to already existed and was never written; it now holds the handler uid.
-- The name is denormalised for display, matching borrow_requests.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reassignment_history JSONB DEFAULT '[]';

-- ── Review stamp ──
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewer_name TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ── Timeline ──
-- Append-only. A single remarks column cannot answer "how did this case get
-- here?"; every status change, remark and reassignment lands here so the student
-- can follow the report and there is an audit trail behind it.
CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- submitted | status_change | remark | reassigned
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter_course ON incidents(reporter_course);

-- ── Legacy status migration ──
-- The old vocabulary was open | investigating | resolved. Map onto the workflow
-- vocabulary; `resolved` already matches and is left alone. Idempotent because
-- the WHERE clauses only match the old values.
UPDATE incidents SET status = 'pending'      WHERE status = 'open';
UPDATE incidents SET status = 'under_review' WHERE status = 'investigating';

-- Backfill a handler name where a handler was somehow already recorded, so the
-- list never renders "Assigned to" with an empty chip.
UPDATE incidents
SET assigned_to_name = assigned_to
WHERE assigned_to IS NOT NULL AND assigned_to <> '' AND assigned_to_name IS NULL;