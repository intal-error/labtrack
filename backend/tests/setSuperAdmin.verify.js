/**
 * Verifies the shared admin-tier rules in utils/adminTiers.js.
 *
 * WHY THIS NEEDS PINNING: `effectiveTier()` is what `--list` prints and what an
 * operator will make a migration decision from, while `getAdminCourses()` is what
 * middleware/courseScope.js uses to decide whether a request may see every course.
 * If the two ever disagree, the script confidently reports a tier the server will
 * not honour -- which is worse than reporting nothing.
 *
 * The subtle case, and the reason these two live in one module:
 *
 *   an admin with no `adminLevel` and no course is an unrestricted SUPER ADMIN.
 *
 * That is inherited behaviour, kept so migration does not strip access from every
 * existing admin on deploy. It also means `--list` is the only way to see it: a
 * Firestore screenshot shows an empty `adminLevel` and a reader concludes nobody has
 * super access. Every legacy shape is therefore a fixture below, not just the new
 * one.
 *
 * Run: node tests/setSuperAdmin.verify.js
 */

const {
  getAdminCourses,
  effectiveTier,
  sortByTier,
  assertPasswordCompliant,
  generatePassword,
} = require("../src/utils/adminTiers");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

// ── The shapes real accounts have ──

const EXPLICIT_SUPER = { role: "admin", adminLevel: "super", courseId: null };
const EXPLICIT_COURSE = { role: "admin", adminLevel: "course", courseId: "CT" };
const LEGACY_HANDLER = { role: "admin", assignedCourses: ["BIT"] };
const LEGACY_MULTI = { role: "admin", assignedCourses: ["BSCS", "BSIT"] };
const LEGACY_SINGLE = { role: "admin", assignedCourse: "CT" };
const LEGACY_NO_COURSE = { role: "admin", assignedCourses: [] };
const LEGACY_BLANK_STRINGS = { role: "admin", assignedCourse: "", assignedCourses: [] };
const COURSE_ADMIN_NO_COURSE = { role: "admin", adminLevel: "course" };
const STUDENT = { role: "student", course: "CT" };

console.log("--- getAdminCourses prefers the current model ---");
check("courseId wins", getAdminCourses({ role: "admin", courseId: "MT", assignedCourses: ["BIT"] }), ["MT"]);
check("falls back to assignedCourses", getAdminCourses(LEGACY_MULTI), ["BSCS", "BSIT"]);
check("falls back to assignedCourse", getAdminCourses(LEGACY_SINGLE), ["CT"]);
check("nothing assigned yields none", getAdminCourses({ role: "admin" }), []);
check("blank strings are not a course", getAdminCourses(LEGACY_BLANK_STRINGS), []);
check("an empty array is not a course", getAdminCourses({ assignedCourses: [] }), []);

console.log("--- an explicit tier always wins ---");
check("explicit super", effectiveTier(EXPLICIT_SUPER).key, "super");
check("explicit course", effectiveTier(EXPLICIT_COURSE).key, "course");
check("explicit course with no course id", effectiveTier(COURSE_ADMIN_NO_COURSE).key, "course");
check("  and it says so", effectiveTier(COURSE_ADMIN_NO_COURSE).label, "Course Admin: (NO COURSE ASSIGNED)");

console.log("--- THE INHERITED CASE: no adminLevel and no course means SUPER ---");
// This is the one that surprises people, and the whole reason --list exists.
check("legacy handler with a course is NOT super", effectiveTier(LEGACY_HANDLER).key, "course");
check("legacy multi-course is NOT super", effectiveTier(LEGACY_MULTI).key, "course");
check("legacy single course is NOT super", effectiveTier(LEGACY_SINGLE).key, "course");
// CHANGED, deliberately. These four used to assert that a course-less admin with no
  // adminLevel reports tier "super". That was the inference removed from
  // courseScope.isSuperAdmin() and mirrored into this function: an incomplete record
  // being reported as unrestricted. `--list` exists to tell an operator what an
  // account can ACTUALLY reach, so it must not claim super for an account the server
  // now locks out. They now assert the fail-closed reporting.
  check("legacy with NO course is NOT super (fail closed)", effectiveTier(LEGACY_NO_COURSE).key, "other");
  check("  and the label says the record is incomplete", /INCOMPLETE/.test(effectiveTier(LEGACY_NO_COURSE).label), true);
  check("blank strings count as no course -> other", effectiveTier(LEGACY_BLANK_STRINGS).key, "other");
  check("an empty assignedCourses array counts as no course -> other", effectiveTier(LEGACY_NO_COURSE).key, "other");

console.log("--- a course-less Course Admin stays a Course Admin ---");
// The dangerous inverse: once adminLevel says "course", failing to find a course
// must NOT fall back to super. courseScope.isSuperAdmin short-circuits on
// adminLevel for exactly this reason.
check("not promoted to super", effectiveTier(COURSE_ADMIN_NO_COURSE).key, "course");
check("and it reports the missing course", /NO COURSE ASSIGNED/.test(effectiveTier(COURSE_ADMIN_NO_COURSE).label), true);

console.log("--- students and unknown roles ---");
check("a student is not an admin", effectiveTier(STUDENT).key, "other");
check("a missing profile is not an admin", effectiveTier(undefined).key, "other");
check("  and says which role it found", /role=none/.test(effectiveTier(undefined).label), true);

console.log("--- sorting puts Super Admins first ---");
const sorted = sortByTier([
  { id: "c", email: "c@x", role: "admin", adminLevel: "course", courseId: "CT" },
  { id: "l", email: "l@x", role: "admin", assignedCourse: "MT" },
  { id: "s", email: "s@x", role: "admin", adminLevel: "super", courseId: null },
  { id: "m", email: "m@x", role: "admin", assignedCourses: [] },
]);
// CHANGED, deliberately. "m" used to be a second super here by inference, so it
  // sorted adjacent to the appointed one. Now it is an incomplete record and sorts
  // last -- which is the more useful listing outcome: an account with no access shows
  // up in the "other" bucket instead of masquerading as an appointment.
  check("supers first, then courses, then incomplete records", sorted.map((a) => a.id), ["s", "c", "l", "m"]);
check("does not mutate the input", sortByTier([{ id: "x", role: "admin", assignedCourses: [] }]).length, 1);

console.log("--- generated passwords always satisfy the app's rules ---");
{
  // 200 samples rather than one: the failure mode is a probabilistic one, and a
  // single sample would not see it. These are the rules in validate.js
  // adminCreateSchema -- a generated password the app rejects at first login is an
  // account nobody can sign into, found only after the script exits 0.
  const samples = Array.from({ length: 200 }, generatePassword);
  let bad = 0;
  for (const pw of samples) {
    try {
      assertPasswordCompliant(pw);
    } catch {
      bad += 1;
    }
  }
  check("all 200 pass the app's rules", bad, 0);
  check("all are long enough", samples.every((p) => p.length >= 8), true);
  check("all are unique", new Set(samples).size, samples.length);
  // base64url, so nothing needs quoting if the credential is ever pasted anywhere.
  check("no shell-hostile characters", samples.every((p) => /^[A-Za-z0-9_-]+$/.test(p)), true);
}

console.log("--- the validator actually rejects what the app rejects ---");
/** Returns the thrown message when refused, or "ACCEPTED" when it should not be. */
function rejection(password) {
  try {
    assertPasswordCompliant(password);
    return "ACCEPTED";
  } catch (e) {
    return e.message;
  }
}
check("too short is refused", rejection("Ab1").includes("at least 8"), true);
check("no uppercase is refused", rejection("abcdefg1").includes("uppercase"), true);
check("no lowercase is refused", rejection("ABCDEFG1").includes("lowercase"), true);
check("no digit is refused", rejection("Abcdefgh").includes("digit"), true);
check("a compliant one is NOT refused", rejection("Abcdefg1"), "ACCEPTED");

console.log("");
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("setSuperAdmin: all checks passed");