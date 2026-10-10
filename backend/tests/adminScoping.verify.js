/**
 * Verifies the course-scope contract in middleware/courseScope.js.
 *
 * This is the file utils/adminScope.js has referenced since before this feature
 * existed ("The contract, which backend/tests/adminScoping.verify.js pins").
 *
 * The assertions that matter most are the two that a plausible-looking
 * implementation gets wrong:
 *
 *   1. A LEGACY admin (no adminLevel, carrying the old assignedCourses array)
 *      must resolve to exactly the courses they could always see. Reading
 *      `courseId` and nothing else silently yields [] for every one of them and
 *      turns the entire incident workflow into a 403 -- which is exactly what
 *      happened the first time this was written.
 *
 *   2. An admin assigned NOTHING must yield an equality filter on a sentinel
 *      value, never `.in(column, [])`. PostgREST answers an empty `in` with a
 *      malformed filter, which the controllers surface as a 500 for the whole
 *      endpoint instead of an empty list.
 *
 * courseScope.js requires only utils/postgrest.js (pure functions), so no
 * Firebase or Supabase stubbing is needed here.
 *
 * Run: node backend/tests/adminScoping.verify.js
 */
const {
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
  requireSuperAdmin,
} = require("../src/middleware/courseScope");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

// A PostgREST builder stand-in that records exactly which predicates were added,
// so the tests can assert on the QUERY rather than on a database round trip.
function fakeQuery() {
  const calls = [];
  const builder = {
    calls,
    in(column, values) { calls.push(["in", column, values]); return builder; },
    eq(column, value) { calls.push(["eq", column, value]); return builder; },
    or(clause) { calls.push(["or", clause]); return builder; },
  };
  return builder;
}

const SUPER = { role: "admin", adminLevel: "super", courseId: null };
const CT_ADMIN = { role: "admin", adminLevel: "course", courseId: "CT" };
const MT_ADMIN = { role: "admin", adminLevel: "course", courseId: "MT" };
const NO_COURSE = { role: "admin", adminLevel: "course" };

// Pre-migration shapes, exactly as adminController.create wrote them.
const LEGACY_HANDLER = { role: "admin", assignedCourses: ["BIT"] };
const LEGACY_MULTI = { role: "admin", assignedCourses: ["BSCS", "BSIT"] };
const LEGACY_SINGLE = { role: "admin", assignedCourse: "CT" };
const LEGACY_ROOT = { role: "admin", assignedCourses: [] };

const STUDENT = { role: "student", course: "CT" };

function req(profile) {
  return { profile };
}

console.log("--- tiers resolve the way the roster shape implies ---");
check("Course Admin is a course admin", isCourseAdmin(CT_ADMIN), true);
check("Course Admin is not super", isSuperAdmin(CT_ADMIN), false);
check("Super Admin is super", isSuperAdmin(SUPER), true);
check("Super Admin is not a course admin", isCourseAdmin(SUPER), false);
check("a student is neither", [isSuperAdmin(STUDENT), isCourseAdmin(STUDENT)], [false, false]);
check("a missing profile is neither", [isSuperAdmin(undefined), isCourseAdmin(null)], [false, false]);

console.log("--- legacy admins keep exactly the courses they had ---");
check("legacy handler resolves to its assignedCourses", scopeCodes(req(LEGACY_HANDLER)), ["BIT"]);
check("legacy multi-course keeps all of them", scopeCodes(req(LEGACY_MULTI)), ["BSCS", "BSIT"]);
check("legacy single assignedCourse is honoured", scopeCodes(req(LEGACY_SINGLE)), ["CT"]);
check("legacy handler is not promoted to super", isSuperAdmin(LEGACY_HANDLER), false);
check("legacy handler is not an explicit course admin", isCourseAdmin(LEGACY_HANDLER), false);

// CHANGED, deliberately. This used to assert `scopeCodes(LEGACY_ROOT) === null`,
// i.e. that a course-less admin with no adminLevel keeps UNRESTRICTED access. That
// was the inference now removed from courseScope.isSuperAdmin(): two empty fields
// meaning maximum privilege. It failed open on the widest grant in the codebase.
// The replacement asserts the fail-closed contract instead -- an incomplete record
// sees NOTHING, because [] is filtered by scoped() into an impossible-course match.
check("a course-less admin with NO adminLevel sees nothing (fail closed)", scopeCodes(req(LEGACY_ROOT)), []);
check("  ...and is NOT treated as super", isSuperAdmin(LEGACY_ROOT), false);

console.log("--- courseId wins, and assignedCourses is only a fallback ---");
check("courseId takes precedence", getAdminCourses({ role: "admin", courseId: "MT", assignedCourses: ["BIT"] }), ["MT"]);
check("falls back to assignedCourses", getAdminCourses(LEGACY_MULTI), ["BSCS", "BSIT"]);
check("falls back to assignedCourse", getAdminCourses(LEGACY_SINGLE), ["CT"]);
check("nothing assigned yields no courses", getAdminCourses({ role: "admin" }), []);
check("isAdminForCourse matches on courseId", isAdminForCourse(CT_ADMIN, "CT"), true);
check("isAdminForCourse rejects another course", isAdminForCourse(CT_ADMIN, "MT"), false);
check("isAdminForCourse rejects a null course", isAdminForCourse(CT_ADMIN, null), false);

console.log("--- scope codes per caller ---");
check("super sees every course", scopeCodes(req(SUPER)), null);
check("a Course Admin sees exactly their own", scopeCodes(req(CT_ADMIN)), ["CT"]);
check("an admin with no course sees nothing", scopeCodes(req(NO_COURSE)), []);
check("a student is unscoped", scopeCodes(req(STUDENT)), null);
check("an anonymous request is unscoped", scopeCodes({}), null);

console.log("--- two Course Admins get different scopes (shared-cache safety) ---");
// The GET response cache is keyed <uid>::<url> (utils/cache.js:27), so two admins
// hitting the identical URL get separate entries. That is only true because their
// SCOPES differ -- if two Course Admins ever resolved to the same codes, one
// would read the other's rows straight out of a cache hit.
check("CT admin and MT admin are scoped differently", [scopeCodes(req(CT_ADMIN)), scopeCodes(req(MT_ADMIN))], [["CT"], ["MT"]]);
{
  const a = scoped(fakeQuery(), "course", req(CT_ADMIN)).calls;
  const b = scoped(fakeQuery(), "course", req(MT_ADMIN)).calls;
  check("identical URLs produce different queries", [a, b], [[["in", "course", ["CT"]]], [["in", "course", ["MT"]]]]);
}

console.log("--- scoped() filters, and an empty scope is a sentinel not an empty in() ---");
{
  const q = fakeQuery();
  check("super leaves the query untouched", scoped(q, "course", req(SUPER)).calls, []);
}
{
  const q = fakeQuery();
  check("course admin gets .in", scoped(q, "course", req(CT_ADMIN)).calls, [["in", "course", ["CT"]]]);
}
{
  const q = fakeQuery();
  const calls = scoped(q, "course", req(NO_COURSE)).calls;
  check("an admin owning nothing yields an empty result", calls, [["eq", "course", IMPOSSIBLE_COURSE]]);
  check("it never sends an empty .in() (that is a 500)", calls.some(([op]) => op === "in"), false);
}
{
  const q = fakeQuery();
  check("students stay unrestricted", scoped(q, "course", req(STUDENT)).calls, []);
}

console.log("--- scopedAny() matches a course on EITHER column, quoted ---");
{
  const q = fakeQuery();
  check("super is untouched", scopedAny(q, ["course", "equipment_course"], req(SUPER)).calls, []);
}
{
  const q = fakeQuery();
  check(
    "course admin ORs both columns",
    scopedAny(q, ["course", "equipment_course"], req(CT_ADMIN)).calls,
    [["or", 'course.eq."CT",equipment_course.eq."CT"']]
  );
}
{
  // Free-text values containing a comma break an unquoted .or() and PostgREST
  // answers with a syntax error -- a 500 for the whole endpoint.
  const q = fakeQuery();
  const calls = scopedAny(q, ["course"], req({ role: "admin", adminLevel: "course", courseId: "IT, CS" })).calls;
  check("a comma in a course name is quoted", calls[0][1], 'course.eq."IT, CS"');
}
{
  const q = fakeQuery();
  check(
    "an admin owning nothing yields an empty result",
    scopedAny(q, ["course", "equipment_course"], req(NO_COURSE)).calls,
    [["eq", "course", IMPOSSIBLE_COURSE]]
  );
}

console.log("--- single-row guard: 404 semantics, and fail closed on no course ---");
check("super may read any row", assertCourseInScope(req(SUPER), "MT"), true);
check("a Course Admin may read its own row", assertCourseInScope(req(CT_ADMIN), "CT"), true);
check("a Course Admin may not read another course", assertCourseInScope(req(CT_ADMIN), "MT"), false);
check("a row with no course is hidden from a Course Admin", assertCourseInScope(req(CT_ADMIN), null), false);
check("a row with an empty course is hidden too", assertCourseInScope(req(CT_ADMIN), ""), false);
check("a row with an unknown course is hidden too", assertCourseInScope(req(CT_ADMIN), "ZZZ"), false);
check("legacy handler keeps its own row", assertCourseInScope(req(LEGACY_HANDLER), "BIT"), true);
check("legacy handler loses another course's row", assertCourseInScope(req(LEGACY_HANDLER), "CT"), false);

console.log("--- attachCourseScope publishes the tier without touching the database ---");
{
  const r = req(CT_ADMIN);
  let nexted = false;
  attachCourseScope(r, {}, () => { nexted = true; });
  check("calls next", nexted, true);
  check("flags a course admin", [r.isSuperAdmin, r.isCourseAdmin], [false, true]);
  check("publishes the scope", r.scopeCodes, ["CT"]);
}
{
  const r = req(SUPER);
  attachCourseScope(r, {}, () => {});
  check("flags a super admin", [r.isSuperAdmin, r.isCourseAdmin], [true, false]);
  check("publishes an unrestricted scope", r.scopeCodes, null);
}

console.log("--- requireSuperAdmin ---");
function callSuperAdmin(profile) {
  const r = req(profile);
  const res = {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
  let nexted = false;
  requireSuperAdmin(r, res, () => { nexted = true; });
  return { nexted, status: res.statusCode };
}
check("super admin passes", callSuperAdmin(SUPER), { nexted: true, status: 200 });
check("a Course Admin is refused", callSuperAdmin(CT_ADMIN).status, 403);
// CHANGED, deliberately. Previously asserted that a legacy course-less admin with
// no adminLevel still PASSED requireSuperAdmin -- locking in the removed inference.
// requireSuperAdmin gates creating/deactivating admins and the course and settings
// write routes, so that assertion granted the system-wide admin surface to a
// malformed record. It now asserts the refusal.
check("a course-less admin with NO adminLevel is refused", callSuperAdmin(LEGACY_ROOT).status, 403);
// Removed: "a legacy unrestricted admin still passes" asserted the removed inference
// and directly contradicted the line above it. The refusal is the whole point.
check("a student is refused", callSuperAdmin(STUDENT).status, 403);

console.log("");
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("adminScoping: all checks passed");