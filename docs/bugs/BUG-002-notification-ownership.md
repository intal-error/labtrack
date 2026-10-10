# BUG-002 — Notification endpoints had no ownership check on `dismiss`

**Status:** FIXED — `notificationsController.dismiss` now verifies ownership.
**Found:** during the security audit, 2026-10-09.
**Severity:** low. Unauthorized write, not a data exposure. Reported accurately below
rather than inflated.

## What was wrong

`dismiss` fetched the notification selecting only `dismissed_by`:

```js
.from("notifications").select("dismissed_by").eq("id", id).single();
```

`target_user_id` was never read, so the handler had no way to tell **whose**
notification it was about to mutate. Any authenticated user could dismiss anyone's
notification by id.

`markRead` (`:84`) already compared `doc.target_user_id !== userId`, so the two
sibling mutators disagreed with each other.

## Actual impact — narrower than it first appears

`dismissed_by` is a **per-viewer array**. The read path filters
`!(n.dismissed_by || []).includes(userId)` for the *current* caller. So appending
your own uid to another user's row only hides that row **from you** — it does not
hide it from its owner.

The defect was therefore an **unauthorized write to another user's record**, and it
let a caller inflate `dismissed_by` against rows they were never sent. It was **not**
a way to suppress someone else's notifications. Stating that precisely matters,
because "anyone can hide your notifications" would have been wrong and would have
justified a much larger change than the one made.

## Fix

- `select("target_user_id, dismissed_by")`, then `doc.target_user_id !== userId` → **404**
- 404 rather than 403: a 403 confirms the notification exists and is addressed to
  somebody, which is itself a small disclosure. This matches the convention already
  used in `borrowRequestController` and `incidentController`.
- Idempotency preserved: dismissing twice still returns 200 and does not append a
  duplicate uid.

## Correction: there is no delete handler

`DELETE /api/notifications/:id` (`routes/notifications.js:10`) routes to **`dismiss`**,
not to a delete handler. An earlier assessment described that route as "the
destructive one". That was wrong — it does not delete anything. No delete handler
exists in this controller, so no destructive surface needed fixing.

## Tests

New `backend/tests/notifications.verify.js` (16 checks), wired into `npm run verify`:

- owner can dismiss; non-owner gets 404 and the row is untouched
- dismissing twice is idempotent
- owner can mark read; non-owner gets 403
- `markAllRead` touches only the caller's rows
- `getAll` returns only the caller's notifications

This controller previously had **no tests at all** — the only notification assertions
in the repo were incidental checks on written rows inside `incidentWorkflow.verify.js`,
which is why the read path went unexamined.

## Retracted: the "field-name mismatch" report

An earlier document claimed every notification was written with camelCase
`targetUserId` while the reader used snake_case `target_user_id`, so the inbox matched
nothing. **That report was wrong and has been deleted.** It was produced by censusing
**Firestore** — the pre-migration store — while the application reads and writes
**Supabase**.

Verified census of the live Supabase table:

```
rows:               733
target_user_id:     733
targetUserId:         0
null target_user_id:  0
```

The "camelCase writers" in `incidentController.js:363/456/504/590` were also
misdiagnosed: they pass `targetUserId` as an object-literal key to the `notify()`
**helper** (`adminScope.js:132`), whose parameter is destructured under that name and
which writes `target_user_id` at `adminScope.js:136`. Renaming those call sites would
have produced `target_user_id: undefined`, which the `NOT NULL` column rejects — a
silent failure, since `notify` swallows insert errors.

Firestore retains 59 legacy `notifications` documents from before the Supabase
migration. They are unread residue, not live data.