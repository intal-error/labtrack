# Laboratory Manuals → Safety Rules conversion plan

**Status: PROPOSAL ONLY. Nothing in this document has been executed.**

No row has been converted, no file moved, no table dropped, no migration run.

## Current state

| Asset | Status |
|---|---|
| `manuals` table | **intact**, all rows present |
| `manuals` rows | **untouched** |
| Manuals' Cloudinary files | **untouched** |
| `manualController.js` / `routes/manuals.js` | **intact and still serving** `/api/manuals` |
| `ManualsTab.jsx` | **retained on disk**, no longer routed to |
| `/api/manuals` mount | **kept** in `server.js` |
| `safety_rules` table | **defined in `22-safety-rules.sql`, NOT created** |
| Safety Rules API/UI | **live in code, dormant** until the migration is applied |

The UI now points at Safety Rules. The Manuals data is preserved and simply not surfaced
anywhere. Nothing was auto-converted or auto-deleted, as agreed.

## Why conversion is not automatic

Converting would require inventing an owner for every existing row. `manuals.course` is
**nullable** and was never required, so a meaningful share of rows have no course at all —
or a course that no longer matches a real program. `safety_rules.course` is `NOT NULL`
with a foreign key to `courses(id)`.

Auto-converting would therefore mean one of:

1. **Inventing a course** for ownerless rows — fabricating data nobody chose.
2. **Failing the insert** on ownerless rows — losing content silently or erroring out.
3. **Making `safety_rules.course` nullable** — reintroducing exactly the defect the new
   table exists to avoid: a row no Course Admin can ever see, visible only to the Super
   Admin.

None of those is acceptable without your decision on **which course owns each orphan row**.

## What conversion would involve

### Step 1 — inventory (read-only, safe to run first)

```sql
SELECT course, COUNT(*) AS rows, COUNT(file_url) AS with_files
FROM manuals
GROUP BY course ORDER BY rows DESC;

SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE course IS NULL OR course = '') AS ownerless
FROM manuals;

-- does each declared course actually exist?
SELECT DISTINCT m.course
FROM manuals m
LEFT JOIN courses c ON c.id = m.course
WHERE m.course IS NOT NULL AND m.course <> '' AND c.id IS NULL;
```

The last query is the important one: a `course` value that matches no `courses` row cannot
be inserted into `safety_rules` because of the foreign key, and would fail the whole
transaction rather than one row.

### Step 2 — you decide ownership for each group

- Ownerless rows → assign a course, or leave as Safety Rules created by you individually.
- Rows whose course no longer exists → remap or archive.
- Everything else → keep its course.

### Step 3 — copy, do not move

```sql
INSERT INTO safety_rules
  (id, title, description, category, course, lab_room, status,
   file_public_id, file_format, file_url, file_name, file_size, file_type,
   thumbnail_url, uploaded_by, created_at, updated_at)
SELECT
  'sr-' || m.id, m.title, m.description, m.category, m.course, m.lab_room, m.status,
  NULL, NULL, m.file_url, m.file_name, m.file_size, m.file_type,
  m.thumbnail_url, m.uploaded_by, m.created_at, m.updated_at
FROM manuals m
JOIN courses c ON c.id = m.course;   -- skips anything unresolvable, on purpose
```

`file_public_id` is **NULL** for every converted row, because existing rows hold a
`file_url` (a public Cloudinary URL) and not a `public_id`. Converting therefore does **not**
retro-fit the Safety Rules file proxy onto old files — they keep working through the stored
URL until they are re-uploaded. That is a separate, optional step (Stage 3 of
`docs/known-issues/safety-rules-file-access.md`).

### Step 4 — verify, then retire (optional, later)

Only after you have confirmed the Safety Rules content is correct:

```sql
SELECT COUNT(*) FROM safety_rules;
-- compare against the manuals count from step 1
```

Retiring the old module means deleting `/api/manuals`, the controller, the route, the mount
and `ManualsTab.jsx`. **That is deliberately not done now** — keeping it costs nothing and
means nothing is lost if the conversion is wrong.

## Rollback

- Before Step 3: nothing to undo.
- After Step 3: `DELETE FROM safety_rules WHERE id LIKE 'sr-%';` restores exactly, since
  `manuals` is never written. The ids are prefixed `sr-` precisely so the copied rows can
  be removed without touching anything hand-created.

## Open questions for you

1. Which course owns the rows where `course` is NULL or empty?
2. Should rows whose course no longer exists be remapped, archived, or left behind?
3. Do you want old files re-uploaded into the private/Signed flow, or left on their existing
   public URLs for now?
4. When (if ever) should `/api/manuals` and `ManualsTab.jsx` be removed?