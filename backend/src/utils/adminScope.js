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
 * Pick the handler for a course: prefer admins assigned to that course, and fall
 * back to any active admin when nobody covers it (an unhandled report is worse
 * than one handled by a general admin). Ties are broken by current workload so
 * one handler does not accumulate every case.
 *
 * `workload` names the queue to measure, because the two features have
 * different "still open" definitions: borrow requests are open while pending,
 * incidents while pending or under review.
 */
async function autoAssignAdmin(course, { table, workloadColumn, workloadStatuses }) {
  try {
    const admins = await getActiveAdminsList();
    if (admins.length === 0) return null;

    let candidates = admins;
    if (course) {
      const matched = admins.filter((a) => isAdminForCourse(a, course));
      if (matched.length > 0) candidates = matched;
    }

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

    candidates.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
    return candidates[0];
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