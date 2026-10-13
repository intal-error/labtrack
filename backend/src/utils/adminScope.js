const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const {
  isSuperAdmin,
  getAdminCourses,
  isAdminForCourse,
  assertCourseInScope,
} = require("../middleware/courseScope");

/**
 * Course scoping for admins, and automatic handler assignment.
 *
 * WHY THIS FILE EXISTS: these helpers lived privately inside
 * borrowRequestController.js and were the only definition of "is this admin
 * responsible for that course". Incident reports need exactly the same rule
 * (assign to the person responsible for the student's course, and keep other
 * courses out), so they were extracted rather than copy-pasted. Two copies of a
 * permission rule is how the two features quietly drift apart and one of them
 * starts leaking rows.
 *
 * The rule itself now lives in middleware/courseScope.js, because it applies to
 * ten surfaces rather than two -- catalog, borrowing, maintenance, rooms and the
 * whole dashboard had no course scoping at all. getAdminCourses, isAdminForCourse
 * and isSuperAdmin are RE-EXPORTED from there rather than defined here, so the
 * codebase has exactly one answer to "may this admin touch this course". Every
 * existing `require("../utils/adminScope").isSuperAdmin` call site keeps working.
 *
 * The contract, which backend/tests/adminScoping.verify.js pins:
 *   - a Course Admin (adminLevel "course") sees and acts only on its course
 *   - a Super Admin (adminLevel "super") sees everything
 *   - an admin with no adminLevel keeps its pre-existing inferred tier
 *   - a row with no course cannot be course-matched, so it stays hidden from
 *     Course Admins (fail closed, never fail open)
 */

// The admin roster changes only when an admin is added, renamed or deactivated --
// all admin-only actions, all rare. It was being re-read from Firestore two to
// three times per incident or borrow-request creation (autoAssignAdmin, then
// getTargetCourseAdmins, then a fallback when the course had no handler), each
// read pulling every admin document in full.
//
// Cached for a minute. That is short enough that a deactivation takes effect
// almost immediately, and long enough to collapse a burst of concurrent requests
// onto one read. Kept OUTSIDE autoAssignAdmin's try/catch on purpose: that
// function swallows Firestore errors so a hiccup cannot block a student from
// filing a report, and a stale-cache read is not an error worth swallowing.
let adminsCache = { at: 0, list: [] };
const ADMINS_TTL_MS = 60 * 1000;

async function getActiveAdminsList() {
  if (Date.now() - adminsCache.at < ADMINS_TTL_MS) return adminsCache.list;

  const snap = await db.collection("users").where("role", "==", "admin").get();
  const list = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((a) => (a.status || "active") === "active");

  adminsCache = { at: Date.now(), list };
  return list;
}

// Called by the admin-management controller after it adds, edits or deactivates an
// admin, so a role change is visible immediately rather than up to a minute later.
function invalidateAdminsCache() {
  adminsCache = { at: 0, list: [] };
}

async function getTargetCourseAdmins(course) {
  if (!course) return [];
  const admins = await getActiveAdminsList();
  return admins.filter((a) => isAdminForCourse(a, course));
}

function displayName(user) {
  return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
}

/**
 * Pick the handler for a course, in TIERS rather than by falling back to everyone.
 *
 * ── WHY THE TIERS ────────────────────────────────────────────────────────────
 *
 * This used to be:
 *
 *     let candidates = admins;
 *     if (course) {
 *       const matched = admins.filter((a) => isAdminForCourse(a, course));
 *       if (matched.length > 0) candidates = matched;
 *     }
 *
 * Two real defects lived in those five lines, and both were reported from the field
 * as "the Borrow Request Details page shows the wrong assigned admin".
 *
 * (1) THE FALLBACK WAS EVERY ADMIN. When no admin covered the course, `matched` was
 *     empty and `candidates` stayed as the WHOLE roster -- including Course Admins of
 *     other courses. Sorted by workload, `candidates[0]` is whoever happened to have the
 *     fewest open rows, so a BIT request could be assigned to an MT admin. That admin
 *     then CANNOT action it: getAllRequests filters by `scopeCodes(req)`, so a
 *     Course Admin only ever sees their own course's requests. The result is work
 *     assigned to someone who will never be shown it -- parked, invisible, and
 *     reported as assigned.
 *
 * (2) SUPER ADMINS COULD NOT MATCH. `isAdminForCourse` is
 *     `getAdminCourses(admin).includes(course)`, and `getAdminCourses` returns `[]` for
 *     a Super Admin (they hold no `courseId`). So `[].includes("BIT")` is false and the
 *     ONE tier that can service any course was excluded from the matched set -- while
 *     being eligible for the unrestricted fallback, where it competed arbitrarily.
 *
 * So the ranking is now explicit, and it only ever returns someone who can actually
 * act on the row:
 *
 *     1. admins assigned to this course  -- the correct owner
 *     2. unrestricted Super Admins       -- can service ANY course
 *     3. nothing                         -- assigned_admin_id stays ""
 *
 * Tier 3 is a deliberate behaviour change and it is the correct one: an unassigned
 * request is VISIBLE and reassignable, whereas a mis-assigned one is invisible to its
 * assignee and looks handled to everyone else. It is also not a dead end -- both
 * callers fan notifications out to `getTargetCourseAdmins(course)`, falling back to all
 * active admins, so the request still reaches a human.
 *
 * `workload` names the queue to measure, because the two features have different
 * "still open" definitions: borrow requests are open while pending, incidents while
 * pending or under review.
 */
async function autoAssignAdmin(course, { table, workloadColumn, workloadStatuses }) {
  try {
    const admins = await getActiveAdminsList();
    if (admins.length === 0) return null;

    const byWorkload = async (pool) => {
      if (pool.length <= 1) return pool[0] || null;

      const { data: openRows } = await supabase
        .from(table)
        .select(workloadColumn)
        .in("status", workloadStatuses);

      const counts = {};
      if (openRows) {
        openRows.forEach((row) => {
          if (row[workloadColumn]) {
            counts[row[workloadColumn]] = (counts[row[workloadColumn]] || 0) + 1;
          }
        });
      }

      // Sorted on a COPY. `getActiveAdminsList` hands back the memoised
      // `adminsCache.list` itself, so an in-place sort here reordered the shared
      // roster for every other caller in the process until the TTL expired.
      const ordered = [...pool].sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
      return ordered[0];
    };

    if (course) {
      const matched = admins.filter((a) => isAdminForCourse(a, course));
      if (matched.length > 0) return await byWorkload(matched);

      // Nobody owns this course. An unrestricted admin is the only tier that can
      // still see the row -- see (2) above for why they are not in `matched`.
      const unrestricted = admins.filter((a) => isSuperAdmin(a));
      if (unrestricted.length > 0) return await byWorkload(unrestricted);

      // Every remaining admin is scoped to some other course and would never be shown
      // this row. Leaving it unassigned is honest; guessing is what produced the bug.
      return null;
    }

    // No course to match on: workload-balance across the whole roster.
    return await byWorkload(admins);
  } catch {
    // Assignment is best-effort. A Firestore hiccup must not block a student
    // from filing a report; the report lands unassigned and is still routable.
    return null;
  }
}

/** 404/403 guard shared by every incident mutation. */
function canHandleIncident(admin, incident) {
  if (!admin || admin.role !== "admin") return false;
  // Delegates rather than re-implementing, so the rule applied to a single
  // incident write cannot drift from the one applied to the list endpoint.
  // Wrapped in a req-shaped object because courseScope is Express-first.
  return assertCourseInScope({ profile: admin }, incident?.reporter_course);
}

/** Notification fan-out that never fails the surrounding write. */
async function notify({ targetUserId, type, title, message, link }) {
  try {
    const { error } = await supabase.from("notifications").insert({
      id: require("crypto").randomUUID(),
      target_user_id: targetUserId,
      type,
      title,
      message,
      read: false,
      dismissed_by: [],
      link,
      created_at: new Date().toISOString(),
    });
    if (error) console.error(`Failed to send "${title}" notification:`, error.message);
  } catch (err) {
    console.error(`Failed to send "${title}" notification:`, err.message);
  }
}

module.exports = {
  getAdminCourses,
  isAdminForCourse,
  isSuperAdmin,
  getActiveAdminsList,
  invalidateAdminsCache,
  getTargetCourseAdmins,
  autoAssignAdmin,
  canHandleIncident,
  displayName,
  notify,
};