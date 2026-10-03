const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");

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
 * The contract, which backend/tests/adminScoping.verify.js pins:
 *   - an admin with assignedCourses is a course handler and sees/acts only on
 *     those courses
 *   - an admin with NO assignedCourses is a super-admin and sees everything
 *   - a row with no course cannot be course-matched, so it stays hidden from
 *     course handlers (fail closed, never fail open)
 */

function getAdminCourses(admin) {
  if (Array.isArray(admin?.assignedCourses) && admin.assignedCourses.length > 0) {
    return admin.assignedCourses;
  }
  if (admin?.assignedCourse) {
    return [admin.assignedCourse];
  }
  return [];
}

function isAdminForCourse(admin, course) {
  if (!course) return false;
  return getAdminCourses(admin).includes(course);
}

function isSuperAdmin(admin) {
  return admin?.role === "admin" && getAdminCourses(admin).length === 0;
}

async function getActiveAdminsList() {
  const snap = await db.collection("users").where("role", "==", "admin").get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((a) => (a.status || "active") === "active");
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
  if (isSuperAdmin(admin)) return true;
  return isAdminForCourse(admin, incident?.reporter_course);
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
  getTargetCourseAdmins,
  autoAssignAdmin,
  canHandleIncident,
  displayName,
  notify,
};