# Documents course scoping — MIGRATION PLAN (NOT APPLIED)

**Status: PREPARED, NOT APPLIED.** Requires your approval before any SQL runs.
**Prepared:** 2026-10-09.

## Why

`documentsController.js` is course-unaware. It has no `course` column at all, so
scoping is not even representable without a migration. `manuals` has the same problem
inverted: `manuals.course` **already exists** but is never enforced.

## Current state (verified against the live project)

| Table | Rows | `course` column | Enforcement |
|---|---|---|---|
| `manuals` | 0 | ✅ exists (`07-manuals.sql:8`) | ❌ none |
| `documents` | 4 | ❌ **missing** | ❌ none |

The 4 existing documents:

| id | name |
|---|---|
| `ca58709a-f40a-40ad-adb8-8561dc7f9107` | `FORM-2-STUDENT-INTERNS-PERSONAL-HISTORY-STATEMENT_Intal.docx` |
| `c33ae41d-3074-4905-8953-04f9769bcc55` | `BIT-INTERNSHIP-CONTRACT-Intal.docx` |
| `1278f6ac-6ed1-4c12-91b0-51371518a8b0` | `BIT-INTERNSHIP-CONTRACT-castro.docx` |
| `5b473628-d3de-493c-80a0-d62945425a04` | `BIT-INTERNSHIP-CONTRACT-castro.docx` |

Three filenames contain `BIT` and one does not. **No course is assigned.** A filename
is not ownership, and guessing from one would be exactly the inference you told me
not to make. All 4 stay `NULL` → Super Admin-only, fail-closed.

## Step 1 — Backup (run first, before any DDL)

```sql
-- Row-level copy. The 4 rows are small, so this is a complete record.
CREATE TABLE IF NOT EXISTS _bak_documents_20261009 AS SELECT * FROM documents;
SELECT * FROM _bak_documents_20261009;
```

Also record the timestamp of the latest **Supabase Dashboard → Database → Backups**
entry. The copy above is the practical rollback; the scheduled backup is the real one.

**Verify:** `SELECT count(*) FROM _bak_documents_20261009;` → must be `4`.

## Step 2 — Migration (idempotent, additive)

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS course TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course);
```

Mirrors `21-course-scope.sql`. Nullable with no default, so **no existing row is
rewritten** and all 4 keep `course = NULL`. No `DROP`, no `NOT NULL`, no FK.

**Verify:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='documents' AND column_name='course';
-- expect: course | text | YES

SELECT count(*) AS unassigned FROM documents WHERE course IS NULL;
-- expect: 4

SELECT count(*) AS rows_preserved FROM documents;
-- expect: 4  (compare against the backup)
```

## Step 3 — Access control (code, applies to both tables)

- `documentsController.getAll` → wrap with `scoped(..., "course", req)`
- `documentsController.deleteDocument` → `assertCourseInScope(req, existing.course)` → **404**, not 403 (a 403 confirms the row exists in another course)
- `manualController.getAll` / `getManual` → same treatment (`manuals.course` already exists; **no migration needed**)
- `manualController.create` → require the course to be in the caller's scope
- `manualController.update` / `remove` → course-check the existing row, and on update re-check a requested course change

### Behavioural consequence you have accepted

The `documents` mount is `authorize("admin")` only (`server.js:182`). A Course Admin
with `scopeCodes → []` therefore sees **zero documents** until courses are assigned.
Fail-closed, but a visible capability gap in the interim. Course Admins get in-app
capability back only after documents are assigned a course.

`manuals` has 0 rows, so scoping it costs nothing today.

## Step 4 — Rollback

```sql
DROP INDEX IF EXISTS idx_documents_course;
ALTER TABLE documents DROP COLUMN IF EXISTS course;
DROP TABLE IF EXISTS _bak_documents_20261009;   -- only after confirming the restore is not needed
```

Safe because the column is new, nullable, and `NULL` on every row — dropping it
cannot lose data. `manuals` needs no rollback: it is never altered, only read
differently.

## Deployment sequence

1. Take the backup, verify `4` rows copied
2. Run the migration, verify the three checks above
3. Deploy the access-control code (reversible independently — see rollback)
4. Assign courses to documents in-app, or leave `NULL` for the Super Admin

## Not covered

- `manuals` and `documents` are **not** in the Firestore rules scoping work. Both are
  Supabase tables; Firestore rules do not govern them.
- The backend API is the only enforcement point for these two tables, since no
  frontend code imports the Firestore SDK.