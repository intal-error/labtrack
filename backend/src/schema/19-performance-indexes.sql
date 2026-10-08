-- 19-performance-indexes.sql
--
-- Indexes for queries that exist in the controllers but had no supporting index.
-- Run once against the target Supabase project.
--
-- ── SAFETY ────────────────────────────────────────────────────────────────────
-- All 22 statements are CREATE INDEX IF NOT EXISTS, so re-running is a no-op and a
-- failure part-way through is harmless: earlier indexes stand, the rest simply do not
-- exist yet. Nothing here drops, alters or deletes. It cannot lose data.
--
-- Verified by tests/validateIndexMigration.mjs: every table and every column is
-- checked against the declared schema, plus duplicate-name detection. It currently
-- reports 22/22 valid, 0 problems. Run it after editing this file:
--
--     node tests/validateIndexMigration.mjs
--
-- ── LOCKING (the one thing that actually matters operationally) ───────────────
-- Plain CREATE INDEX takes a SHARE lock, which BLOCKS inserts/updates/deletes on the
-- table for its duration. Reads continue. That is invisible on a small table and a
-- genuine outage on a large one: students scanning in would get lock-wait timeouts
-- while the index builds.
--
-- Measured against the project this repo currently points at (see
-- tests/probeTableSizes.mjs) the tables are essentially empty:
--
--     notifications 721 | catalog 65 | transactions 12
--     lab_attendance 3  | incidents 1 | fines 0        ~808 rows TOTAL
--
-- At that size all 22 statements finish in well under a second and the lock is a
-- non-issue. Run it during a quiet moment anyway.
--
-- ⚠ IF YOU POINT THIS AT A DIFFERENT PROJECT THAT HAS REAL DATA, RE-READ THIS.
-- Once a table passes roughly 100k rows, switch to CREATE INDEX CONCURRENTLY, which
-- does not block writes. Two constraints to know first:
--   - CONCURRENTLY cannot run inside a transaction block, so the Supabase SQL Editor
--     (which wraps a script) will reject it. Run each statement on its own, or use
--     the `psql` / Supabase CLI connection.
--   - A CONCURRENTLY build that fails leaves an INVALID index behind. Find them with:
--       SELECT indexname FROM pg_indexes WHERE schemaname='public'
--        AND indexname LIKE 'idx_%' AND NOT indisvalid;
--     and drop those before retrying. A plain CREATE INDEX has no such failure mode,
--     which is why it is the right default at this size.
--
-- ── WHAT IS ACTUALLY HERE ─────────────────────────────────────────────────────
-- 20 of the 22 support a query that exists today. Two (idx_transactions_due_pending,
-- idx_transactions_reminder) are currently unused because overdueChecker.js still
-- filters in JS rather than SQL; both are marked inline and are safe to delete.
--
-- Several of these make an older single-column index redundant as a left-prefix
-- (for example idx_fines_status_created supersedes idx_fines_status). The old ones
-- are deliberately LEFT ALONE: dropping an index is not reversible without knowing
-- every query that uses it, and an unused index costs only a little disk and write
-- throughput. Revisit only with a real EXPLAIN ANALYZE in hand.
--
-- ── USEFULNESS CAVEAT ─────────────────────────────────────────────────────────
-- On a table this small Postgres will ignore nearly all of these and use sequential
-- scans anyway, because scanning 800 rows is cheaper than consulting any index. They
-- exist for the day the tables grow. Do not judge them by query speed in the first
-- week after deploying.

-- ── transactions ────────────────────────────────────────────────────────────

-- overdueChecker.js: intends to find open loans past their due date.
--
-- ⚠ THIS INDEX IS CURRENTLY UNUSED. Read this before assuming it is doing something.
--
-- The comment in an earlier revision of this file claimed overdueChecker had been
-- rewritten to push the date comparison into SQL. It was not. As of this writing the
-- query is still:
--
--     supabase.from("transactions").select("*").eq("action", "borrowed")
--     for (const tx of transactions) { if (tx.status === "returned") continue; ... }
--
-- The status test and the due-date comparison both happen in JS. A PARTIAL index is
-- only usable when the query's WHERE clause implies the index predicate, and
-- `action = 'borrowed'` does NOT imply `status <> 'returned'`. So Postgres cannot
-- choose this index for that query, and will keep sequentially scanning.
--
-- Kept anyway because it is free at current scale (see the header) and becomes useful
-- the moment overdueChecker is pushed down. If you would rather not carry an index
-- nothing uses, delete the statement below -- nothing else depends on it.
--
-- It is also NOT "(action, status, due_date) together" as once claimed. It carries
-- only (due_date); the two predicates are the partial filter.
CREATE INDEX IF NOT EXISTS idx_transactions_due_pending
  ON transactions (due_date)
  WHERE action = 'borrowed' AND status <> 'returned';

-- transactionFilters.js queryTransactions(): the admin Borrowed/Returned tabs filter
-- by action and, in the borrowed bucket, by status.
CREATE INDEX IF NOT EXISTS idx_transactions_action_status
  ON transactions (action, status);

-- Same endpoint, date-bounded range scans. A (action, timestamp) pair lets Postgres
-- satisfy .eq("action", ...).order("timestamp") as an index scan instead of sorting
-- the whole bucket per request.
CREATE INDEX IF NOT EXISTS idx_transactions_action_timestamp
  ON transactions (action, timestamp DESC);

-- ⚠ ALSO CURRENTLY UNUSED, for the same reason as idx_transactions_due_pending above.
-- overdueChecker reads tx.reminder_sent / tx.reminder_sent_at from JS objects
-- (overdueChecker.js:27-29); neither appears in any SQL predicate. A partial index on
-- `reminder_sent = false` cannot serve a query that never mentions the column.
--
-- Kept for the same reason, and equally safe to drop.
CREATE INDEX IF NOT EXISTS idx_transactions_reminder
  ON transactions (reminder_sent_at)
  WHERE reminder_sent = false;

-- ── lab_attendance ──────────────────────────────────────────────────────────

-- getRoomAttendanceHistory: the room page. This was the single most expensive read
-- in the app -- `.select("*")` with no filter at all -- and it already used
-- `.eq("room_code", ...)`, so idx_lab_attendance_room served it, but every row for
-- the room still had to be fetched and sorted before pagination. Adding `date` lets
-- the range-filtered variant of the same query use an index.
CREATE INDEX IF NOT EXISTS idx_lab_attendance_room_date
  ON lab_attendance (room_code, date DESC);

-- timeIn / timeOut / autoScan: find the student's newest open session. These three
-- used to read the student's ENTIRE attendance history per scan to locate at most one
-- row; they now ask for status='active' ordered by time_in, newest first, limit 1.
-- Partial, so the index only carries open sessions.
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student_active
  ON lab_attendance (student_school_id, time_in DESC)
  WHERE status = 'active';

-- The duplicate-scan guard: newest created_at for one student on one day. The
-- existing (student_school_id, date) index covers the equality part; this adds the
-- ordering so the limit-1 lookup needs no sort.
CREATE INDEX IF NOT EXISTS idx_lab_attendance_student_created
  ON lab_attendance (student_school_id, created_at DESC);

-- getAttendanceFacets: previously an unfiltered read of six columns across the whole
-- table. Now one indexed scan per facet column, so each benefits from a plain index.
-- Cheap to add: five single-column b-trees on small-cardinality text columns.
CREATE INDEX IF NOT EXISTS idx_lab_attendance_course ON lab_attendance (course);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_year   ON lab_attendance (year);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_section ON lab_attendance (section);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_subject ON lab_attendance (subject);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_professor ON lab_attendance (professor);

-- getActiveStudents: every open session, newest first, optionally narrowed by room.
CREATE INDEX IF NOT EXISTS idx_lab_attendance_active_time_in
  ON lab_attendance (time_in DESC)
  WHERE status = 'active';

-- ── fines ──────────────────────────────────────────────────────────────────

-- getAllFines: status and course filters are now pushed into SQL, and the list is
-- ordered by created_at DESC within the filtered set. One composite covers
-- filter-then-sort; a separate user/status pair serves the per-student restriction
-- checks in borrowRequestController and finesController.
CREATE INDEX IF NOT EXISTS idx_fines_status_created
  ON fines (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fines_user_status
  ON fines (user_id, status);

-- ── borrow_requests ─────────────────────────────────────────────────────────

-- getAllRequests: ordered by created_at DESC with an optional status filter, and
-- course-scoped for non-super-admins (target_course OR equipment_course).
CREATE INDEX IF NOT EXISTS idx_borrow_requests_status_created
  ON borrow_requests (status, created_at DESC);

-- The course OR spans two columns, so each needs its own index for Postgres to use
-- a bitmap OR rather than a sequential scan.
CREATE INDEX IF NOT EXISTS idx_borrow_requests_equipment_course
  ON borrow_requests (equipment_course);

-- adminScope.autoAssignAdmin counts open rows per handler to pick the least-loaded
-- admin. This was transferring one column per open row to build ~10 counters.
CREATE INDEX IF NOT EXISTS idx_borrow_requests_assigned_status
  ON borrow_requests (assigned_admin_id, status);

-- ── incidents ──────────────────────────────────────────────────────────────

-- Same workload-count query as borrow requests.
CREATE INDEX IF NOT EXISTS idx_incidents_assigned_status
  ON incidents (assigned_to, status);

-- getAll: status + severity + date filters over a created_at DESC listing.
CREATE INDEX IF NOT EXISTS idx_incidents_status_created
  ON incidents (status, created_at DESC);

-- ── catalog ────────────────────────────────────────────────────────────────

-- CatalogBrowser filters by status and course together and lists by name.
CREATE INDEX IF NOT EXISTS idx_catalog_status_course
  ON catalog (status, course);

-- ── notifications ──────────────────────────────────────────────────────────

-- The unread badge counts unread rows for one recipient. The existing
-- (target_user_id, read) index serves it, but this one carries created_at so a
-- "latest N unread" read does not sort the recipient's whole inbox.
CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
  ON notifications (target_user_id, created_at DESC)
  WHERE read = false;

-- ── post-migration ─────────────────────────────────────────────────────────
--
-- Index creation on a large table locks writes (see the header). Rebuild with
-- CONCURRENTLY when the tables are big.
--
-- ANALYZE afterwards so the planner has real statistics for the new indexes instead
-- of guessing. Run these OUTSIDE a transaction, and only the tables actually touched:
--
--     ANALYZE transactions;
--     ANALYZE lab_attendance;
--     ANALYZE fines;
--     ANALYZE borrow_requests;
--     ANALYZE incidents;
--     ANALYZE catalog;
--     ANALYZE notifications;
--
-- Supabase already runs ANALYZE on its own schedule, so this is a nice-to-have that
-- mainly matters in the first few minutes after the migration.