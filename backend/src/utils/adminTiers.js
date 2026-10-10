const crypto = require("crypto");

/**
 * Which admin accounts are Course Admins and which are Super Admins.
 *
 * WHY THIS IS ITS OWN MODULE: two things need to agree on the answer and neither
 * may own it privately.
 *
 *   - middleware/courseScope.js decides whether a request may see every course. It
 *     does that on EVERY authenticated request, for all ten scoped surfaces.
 *   - scripts/set-super-admin.js has to tell an operator what their roster actually
 *     grants, in `--list`, before and after any migration. If the two disagree, the
 *     script reports a tier the server will not honour, which makes it worse than
 *     no report at all.
 *
 * So the rule lives here once and both require it.
 *
 * THE INHERITANCE, because it is the part that surprises people: an admin with NO
 * `adminLevel` is a Super Admin if it holds no course, and a Course Admin otherwise.
 * That is the rule that predates per-course scoping, kept so that migration does not
 * silently strip access from every existing admin on deploy. The consequence is
 * that an admin created without selecting a course is an unrestricted Super Admin
 * TODAY, by accident rather than by appointment -- invisible to any check that
 * reads `adminLevel`. `effectiveTier()` below exists to make that visible.
 *
 * Once `adminLevel` is present it is authoritative, which is what
 * `--assign-course` writes.
 */

/**
 * The courses an admin is responsible for. `courseId` is the current model; the
 * assignedCourses/assignedCourse fields are the pre-migration shapes.
 */
function getAdminCourses(admin) {
  if (admin?.courseId) return [admin.courseId];
  if (Array.isArray(admin?.assignedCourses) && admin.assignedCourses.length > 0) return admin.assignedCourses;
  if (admin?.assignedCourse) return [admin.assignedCourse];
  return [];
}

/**
 * The tier this account can actually reach, resolved rather than read off the fields.
 *
 * Returns { key, label } so callers can sort on a stable key instead of matching on
 * prose. `key` is "super", "course" or "other".
 *
 * THIS NOW MIRRORS courseScope.isSuperAdmin() EXACTLY, and that is a change.
 *
 * It used to return `key: "super"` for an admin with no adminLevel and no courses --
 * the same inference that has been removed from courseScope, where it granted
 * unrestricted scope. Left alone, this function would now report "SUPER" for an
 * account the server considers locked out, so `set-super-admin.js --list` would tell
 * an operator the opposite of the truth about who can reach every course.
 *
 * An admin with courses but no adminLevel is still a Course Admin: that is a real,
 * intended tier, just not yet pinned. An admin with NEITHER is "other" -- incomplete
 * record, no access -- which is what fail-closed means when you describe it.
 */
function effectiveTier(admin) {
  if (admin?.role !== "admin") {
    return { key: "other", label: `not an admin (role=${admin?.role || "none"})` };
  }

  if (admin.adminLevel === "super") {
    return { key: "super", label: "SUPER ADMIN (explicit)" };
  }
  if (admin.adminLevel === "course") {
    return { key: "course", label: `Course Admin: ${admin.courseId || "(NO COURSE ASSIGNED)"}` };
  }

  const courses = getAdminCourses(admin);
  if (courses.length === 0) {
    return {
      key: "other",
      label: "INCOMPLETE - admin with no adminLevel and no course; has NO access until pinned",
    };
  }
  return {
    key: "course",
    label: `Course Admin: ${courses.join(", ")} (legacy, not yet pinned)`,
  };
}

const TIER_ORDER = { super: 0, course: 1, other: 2 };

/** Super Admins first, then Course Admins alphabetically -- for --list output. */
function sortByTier(admins) {
  return [...admins].sort(
    (a, b) =>
      TIER_ORDER[effectiveTier(a).key] - TIER_ORDER[effectiveTier(b).key] ||
      String(a.email || a.id).localeCompare(String(b.email || b.id))
  );
}

// ── Passwords ────────────────────────────────────────────────────────────────
//
// The rules are validate.js adminCreateSchema's, copied because that schema runs
// inside the API and pulling it into a CLI script drags the whole request pipeline
// in with it. If they ever diverge, `assertPasswordCompliant` below is the one place
// that notices -- and a generated password the app would reject at first login is
// an account nobody can sign into, discovered only after a script exits 0.

const PASSWORD_RULES = [
  [/[A-Z]/, "one uppercase letter"],
  [/[a-z]/, "one lowercase letter"],
  [/[0-9]/, "one digit"],
];

function assertPasswordCompliant(password) {
  const problems = [];
  if (password.length < 8) problems.push("at least 8 characters");
  if (password.length > 128) problems.push("at most 128 characters");
  for (const [re, label] of PASSWORD_RULES) if (!re.test(password)) problems.push(label);
  if (problems.length) {
    throw new Error(`password violates the app's rules: ${problems.join(", ")}`);
  }
  return password;
}

/**
 * A random password for a bootstrap account.
 *
 * base64url rather than base64 so the credential has no characters that need quoting
 * or escaping wherever it is eventually pasted. Never printed and never accepted as
 * an argument -- the script's only path to a usable credential is a reset link.
 */
function generatePassword() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = crypto.randomBytes(32).toString("base64url");
    try {
      return assertPasswordCompliant(candidate);
    } catch {
      // Astronomically unlikely -- 32 random bytes failing an uppercase+lowercase+
      // digit test. Retry rather than ship a non-conforming password.
    }
  }
  throw new Error("could not generate a password satisfying the app's rules");
}

module.exports = {
  getAdminCourses,
  effectiveTier,
  sortByTier,
  assertPasswordCompliant,
  generatePassword,
};