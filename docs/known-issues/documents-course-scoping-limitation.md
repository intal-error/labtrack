# Documents — known access limitation (no code change)

**Status:** documented only. The deferred Documents migration has NOT been performed and
the Documents module has NOT been modified.

## The limitation

`documents` has **no `course` column**, so there is nothing for course scoping to filter
on. Every admin who can reach `/api/documents` therefore sees **every** document in the
system, regardless of course.

Current mount (`server.js`):

```
app.use("/api/documents", verifyToken, authorize("admin"), methodAwareLimiter, documentsRoutes);
```

So:

| Caller | Result |
|---|---|
| Student | 403 — correctly blocked, the mount requires `authorize("admin")` |
| Course Admin | 200 — **sees every course's documents** |
| Super Admin | 200 — correct |

## Why this is not being "fixed" here

Closing it requires adding a `course` column to `documents`, which is exactly the deferred
migration at `docs/migrations/documents-course-scope-plan.md`. That plan includes a backup
and a rollback procedure and has not been approved, so it is deliberately left alone.

Until it is applied, `assertCourseInScope()` cannot be used here: with no `course` field
every row would resolve to the "not in any course" case, which `assertCourseInScope`
correctly treats as out of scope for everyone but the Super Admin. Applying the scope
guard WITHOUT the column would therefore hide all documents from every Course Admin —
turning a confidentiality problem into an availability one. The column and the guard must
land together.

## Residual risk

- **Confidentiality.** A Course Admin can read and delete documents belonging to other
  courses. This is unchanged from before this work.
- **Deletion.** `DELETE /api/documents/:id` is `authorize("admin")` with no course check,
  so a Course Admin can delete another course's document.
- **Blast radius is limited** by the mount gate: no student access, and the UI exposes
  documents to admins only.

## How it is covered today

Not by the course scope. It is covered only by the admin gate — which is what
`tests/adminSurfaceScope.verify.js` asserts (a non-admin is refused `/api/documents`).
There is deliberately **no** Course-Admin-confinement assertion for documents, because such
a test could only be written once the column exists.

## Recommended follow-up

Restore `docs/migrations/documents-course-scope-plan.md` and apply it, then add
`assertCourseInScope` to the documents list and delete paths **in the same change**, with a
matching test. Applying one without the other would, as noted above, hide everything from
Course Admins.