-- Leading index on `status` alone, for the "Currently Inside" query.
--
-- WHY: getActiveStudents used to filter `date = today AND status = 'active'`,
-- which the existing idx_lab_attendance_date_status (date, status) covered. It
-- now filters on `status` alone so that a session which crossed midnight stays
-- visible instead of vanishing -- a session is open until something closes it.
-- Postgres cannot use a (date, status) index for that: date is the leading
-- column, so the whole index is skipped and the poll falls back to a sequential
-- scan.
--
-- This matters more than the row count suggests. The endpoint is polled every 30
-- seconds by every open attendance screen, and the result set is tiny by design
-- (only unclosed sessions), so a selective index keeps it cheap as lab_attendance
-- grows.
--
-- Safe to run on a live database: CREATE INDEX IF NOT EXISTS takes a lock only
-- long enough to check for the name.

CREATE INDEX IF NOT EXISTS idx_lab_attendance_status ON lab_attendance(status);