const { orEqAny } = require("../utils/postgrest");
const { getAdminCourses } = require("../utils/adminTiers");

/**
 * Course scoping: who may see and touch which course's data.
 *
 * WHY THIS FILE EXISTS: adminScope.js already had a course rule, but it was
 * inferred from an admin having no `assignedCourses`, and it was only ever
 * applied to incidents and borrow requests. Every other surface -- catalog,
 * borrowing, maintenance, rooms, the whole dashboard -- was unscoped. This
 * module makes the rule explicit, applies it from one place, and is reusable by
 * any future surface.
 *
 * THE CONTRACT, which backend/tests/adminScoping.verify.js pins:
 *   - a Course Admin sees and manages ONLY their own course's rows
 *   - a Super Admin sees and manages everything
 *   - a row whose course is unknown (NULL, or a courseId matching no row in
 *     `courses`) is visible to the Super Admin ONLY. Fail closed, never open.
 *
 * WHY courseId IS THE PROGRAM CODE: it is stored as the primary key of
 * `courses`, so a Course Admin's course is resolvable to a query filter with
 * zero database reads. There is no uuid -> program-code lookup on the hot path,
 * and therefore no cache to warm or invalidate. `courses.id` is frozen and
 * never regenerated on rename, matching the lab_rooms.room_code convention.
 *
 * WHY `scoped()` RETURNS A QUERY AND NEVER NULL: PostgREST answers an empty
 * `.in(column, [])` with a malformed filter, which the controllers turn into a
 * 500 for the WHOLE endpoint. Returning null instead would force every call site
 * into an `if` before it could chain `.eq()`, which is precisely where a future
 * caller forgets. So a Course Admin who owns nothing gets an equality filter on
 * a sentinel value that cannot exist: an empty result, through the normal path.
 */

const IMPOSSIBLE_COURSE = "__no_course_in_scope__";


function isAdminForCourse(admin, course) {
  if (!course) return false;
  return getAdminCourses(admin).includes(course);
}

/**
 * Whether this profile may see every course.
 *
 * THE INFERENCE THAT USED TO BE HERE IS GONE, AND ITS REMOVAL IS THE POINT.
 *
 * It read:
 *
 *     if (profile.adminLevel) return profile.adminLevel === "super";
 *     return getAdminCourses(profile).length === 0;   // <-- removed
 *
 * That second line made an admin with no `adminLevel` and no courses a Super Admin
 * by ACCIDENT rather than by appointment. Nothing ever assigns it; it is a
 * side-effect of two independent fields both being empty. The original justification
 * was that defaulting the absent case the other way would "promote every existing
 * course handler to unrestricted on deploy", which was true at the time -- and it
 * bought that safety by making an empty record mean MAXIMUM privilege. Fail-open
 * chosen to avoid fail-open.
 *
 * Why it had to go rather than be left as a documented quirk:
 *
 *   - courseScope.js:86 -- `scopeCodes()` returning `null` is the widest grant in the
 *     codebase: it removes the course filter from all ten scoped surfaces.
 *   - courseScope.js:157 -- requireSuperAdmin() gates POST /api/admin (creating and
 *     deactivating admins) and the course and settings write routes.
 *   - authController.js:75 -- publishes `isSuperAdmin: true` to the client.
 *
 * So a single malformed profile was silently a system-wide admin.
 *
 * NOW: `adminLevel` is the SOLE authority. Missing role or missing level both fail
 * closed, so an admin whose record is incomplete sees NOTHING rather than everything.
 * That is the safe direction to fail in, and it is what adminController.js's
 * `isExplicitSuperAdmin` already did for the guards on the Super Admin account.
 *
 * MIGRATION SAFETY, verified against the live roster before this edit: the inference
 * only fires for role=="admin" AND no adminLevel AND zero courses. Of the 9 live admin
 * documents, 0 matched -- every non-super admin holds at least one course, and the
 * single account with adminLevel=="super" is the real appointment. Nobody loses
 * access. Going forward, an admin created without a course is locked out rather than
 * promoted, which is the intended trade.
 */
function isSuperAdmin(profile) {
  if (profile?.role !== "admin") return false;
  return profile?.adminLevel === "super";
}

function isCourseAdmin(profile) {
  return profile?.role === "admin" && profile.adminLevel === "course";
}

/**
 * The course codes this request may see, or null for "no restriction".
 *
 * null   -> super admin, a legacy unrestricted admin, or a non-admin (students
 *           keep today's unrestricted behaviour)
 * [...]  -> the courses the admin is responsible for. Exactly one for a Course
 *           Admin; possibly several for a legacy admin, which is what they
 *           could always see.
 * []     -> an admin assigned no course, which yields nothing
 *
 * Built from getAdminCourses rather than read straight off `courseId`, because a
 * Course Admin must end up with EXACTLY the courses they had before
 * courseScope.js existed. Reading courseId alone silently produced [] for every
 * legacy handler, which turned the whole incident workflow into a 403.
 *
 * A misspelled adminLevel falls into the getAdminCourses branch rather than the
 * null branch, so a typo locks an admin down instead of silently granting them
 * every course in the building.
 */
function scopeCodes(req) {
  const profile = req?.profile;
  if (!profile || profile.role !== "admin") return null;
  if (isSuperAdmin(profile)) return null;
  return getAdminCourses(profile);
}

/**
 * Populates req.isSuperAdmin / req.isCourseAdmin for controllers that want to
 * branch on the caller's tier.
 *
 * Synchronous and I/O free on purpose: `authorize("admin")` and
 * `attachRole` have already resolved req.profile from Firestore by the time this
 * runs, so mounting it adds no extra read to the request path. It MUST be
 * mounted after one of those two, never before.
 */
function attachCourseScope(req, res, next) {
  req.isSuperAdmin = isSuperAdmin(req.profile);
  req.isCourseAdmin = isCourseAdmin(req.profile);
  req.scopeCodes = scopeCodes(req);
  next();
}

/** Restricts a PostgREST builder to the caller's course. See IMPOSSIBLE_COURSE. */
function scoped(query, column, req) {
  const codes = scopeCodes(req);
  if (codes === null) return query;
  if (codes.length === 0) return query.eq(column, IMPOSSIBLE_COURSE);
  return query.in(column, codes);
}

/**
 * The same restriction for a row that a course can be read from EITHER of two
 * columns -- transactions match `course` (who borrowed) or `equipment_course`
 * (whose equipment it is), so a Course Admin must see both: their own students'
 * loans AND loans of their own equipment.
 *
 * Routed through orEqAny because these columns are free text and a value
 * containing a comma, quote or bracket produces a malformed .or(), which
 * PostgREST answers with a 500 for the entire endpoint.
 */
function scopedAny(query, columns, req) {
  const codes = scopeCodes(req);
  if (codes === null) return query;
  if (codes.length === 0) return query.eq(columns[0], IMPOSSIBLE_COURSE);
  return query.or(codes.map((code) => orEqAny(columns, code)).join(","));
}

/**
 * Single-row read guard.
 *
 * Returns 404, never 403: a 403 confirms the row exists, which leaks the very
 * thing the restriction exists to hide. The caller should treat false as "no
 * such row" and not distinguish it from a genuine miss.
 */
function assertCourseInScope(req, course) {
  const codes = scopeCodes(req);
  if (codes === null) return true;
  return Boolean(course) && codes.includes(course);
}

/**
 * Write guard for a client-supplied course.
 *
 * Returns false rather than throwing so the caller chooses the status; the
 * convention is 400, because this is a rejected form value rather than a
 * resource the caller was denied.
 */
function assertWritableCourse(req, course) {
  return assertCourseInScope(req, course);
}

/** Blocks the route unless the caller is an explicit Super Admin. */
function requireSuperAdmin(req, res, next) {
  if (isSuperAdmin(req.profile)) return next();
  return res.status(403).json({ error: "Super Admin access required" });
}

module.exports = {
  IMPOSSIBLE_COURSE,
  getAdminCourses,
  isAdminForCourse,
  isSuperAdmin,
  isCourseAdmin,
  scopeCodes,
  attachCourseScope,
  scoped,
  scopedAny,
  assertCourseInScope,
  assertWritableCourse,
  requireSuperAdmin,
};
