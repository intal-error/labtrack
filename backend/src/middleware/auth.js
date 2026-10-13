const { auth, db } = require("../config/firebase");

/**
 * Whether an account is entitled to use the API at all.
 *
 * THIS IS THE SECOND REVOCATION GATE, AND IT IS THE ONE THAT MATTERS.
 *
 * Deactivating an admin writes two things: `disabled: true` on the Firebase Auth
 * record, and `status: "inactive"` on the Firestore profile. The first is enough on
 * its own -- auth.verifyIdToken rejects a disabled user's token -- but relying on it
 * alone means the app's access control depends on an external service having accepted
 * a write. If that write failed, if an account predates the mirror, or if a token was
 * already minted, the only thing standing between a deactivated Course Admin and the
 * whole admin surface is a call this app makes and can verify.
 *
 * So the authoritative check lives here, reading the Firestore profile on every
 * request. verifyToken is the right place for it: it runs before authorize() on every
 * route, so a deactivated account is turned away before any role is even considered,
 * and no handler has to remember to check.
 *
 * AN ALLOWLIST, NOT A DENYLIST. `status !== "inactive"` would admit every value nobody
 * thought about -- "disabled", "suspended", "archived", a typo, a value some future
 * migration invents -- and each of those would be a deactivated account walking into
 * an admin surface. Naming the single permitted value makes the safe direction the
 * default.
 *
 * AN ABSENT status COUNTS AS ACTIVE, deliberately. Every account this app creates
 * writes `status: "active"` (authController.register:145, adminController.create:131
 * and :155, set-super-admin.js:372), but records migrated before the field existed
 * have none. The rest of the codebase already reads it this way -- getActiveAdmins
 * compares `(a.status || "active") === "active"` -- so failing closed on absence would
 * lock every pre-migration account out the moment this ships, which is the one outcome
 * the field's absence exists to avoid. Only a PRESENT, UNRECOGNISED value is refused.
 *
 * A profile that resolves to nothing (a uid in neither `users` nor `admins`) is NOT
 * active. That is an account with no record in this system at all, and the whole
 * roster of guards downstream is written on the assumption that an account exists.
 */
const isAccountActive = (profile) => {
  if (!profile) return false;
  const status = profile.status;
  if (status === undefined || status === null || status === "") return true;
  return String(status).toLowerCase() === "active";
};

const verifyToken = async (req, res, next) => {
  // Idempotent on purpose. server.js:125 already runs this for every /api/attendance
  // request, and then routes/attendance.js ran it again on all sixteen routes --
  // so each admin attendance call paid two RSA-2048 signature verifications plus
  // (on a cold key cache) two public-key fetches. Re-verifying a token that is
  // already attached cannot change the answer, it can only cost latency.
  //
  // It early-returns past the TOKEN check only. The account-status gate below still
  // runs on this path: an admin who has just been deactivated must lose access on
  // their very next request, not only on requests carrying a freshly minted token.
  // ensureProfile() short-circuits on an already-resolved req.profile, so taking this
  // path still costs no extra Firestore read.
  if (!req.user?.uid) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    try {
      const token = header.split("Bearer ")[1];
      req.user = await auth.verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // Same profile lookup authorize()/attachRole() would do, hoisted here so the status
  // gate has something to read. It also fills req.user.role from the profile when the
  // token carried no claim, so calling it here does not change what authorize() later
  // decides.
  try {
    await ensureProfile(req);
  } catch (err) {
    console.error("Failed to verify account status:", err.message);
    return res.status(401).json({ error: "Unable to verify account" });
  }

  if (!isAccountActive(req.profile)) {
    // 401, not 403. The token is genuine and correctly signed -- it belongs to an
    // account that is no longer entitled to use it. 401 is also what a disabled Auth
    // record produces (auth/user-disabled), so the two revocation paths look identical
    // from outside, and it tells the client to sign out rather than to retry.
    return res.status(401).json({ error: "Account is inactive" });
  }

  next();
};

// Firestore doc reads are a network hop each time -- firebase-admin has no
// read-through cache, so `get()` always talks to the server.
//
// This used to return just the role string, throwing the rest of the document
// away. Fourteen controllers then re-fetched the SAME document to get the name,
// schoolId or reviewer fields they needed, so every admin write cost two Firestore
// round trips (incidentController.reassign paid three). Returning the whole
// document and parking it on req means the second read never happens.
//
// The `role` is spread FIRST here so a `role` field stored on an admins document
// cannot override the forced "admin". It was the other way round, which meant any
// future admins document carrying a stale `role` would silently strip its owner's
// admin access. adminController writes admins docs without a role field today, so
// this is latent rather than active -- but the failure mode is a locked-out admin.
async function resolveProfile(req) {
  if (!req.user?.uid) return null;

  const userDoc = await db.collection("users").doc(req.user.uid).get();
  if (userDoc.exists) return { id: userDoc.id, ...userDoc.data() };

  const adminDoc = await db.collection("admins").doc(req.user.uid).get();
  if (adminDoc.exists) return { id: adminDoc.id, ...adminDoc.data(), role: "admin" };

  return null;
}

/**
 * Populates req.profile, and req.user.role if the token did not already carry one.
 *
 * WHY THE PROFILE AND THE ROLE ARE DECIDED SEPARATELY -- this is subtle and it
 * broke the app once already, so read it before changing the condition.
 *
 * `auth.verifyIdToken` merges Firebase CUSTOM CLAIMS into the decoded token, and
 * `authController.register` calls `auth.setCustomUserClaims(uid, { role })` on
 * every single signup. So for any account created through this app, `req.user.role`
 * is ALREADY set the moment verifyToken returns.
 *
 * An earlier version of this function guarded BOTH on `if (!req.user.role)`, which
 * meant resolveProfile never ran for exactly those accounts -- leaving req.profile
 * undefined for essentially all real traffic. Every controller that reads
 * req.profile then failed: students could not view attendance, file reports or
 * submit requests, and the whole incident review workflow 403'd. It was invisible in
 * tests because the harness injects req.profile by hand.
 *
 * The correct rule:
 *   - req.profile is ALWAYS resolved when missing. It is the authoritative document,
 *     and controllers need fields (firstName, schoolId, assignedCourses) that a
 *     token claim does not carry.
 *   - req.user.role is only filled in when absent, so a token claim keeps winning for
 *     authorization exactly as it did before this refactor. No new privilege path,
 *     and a Firestore demotion still only takes effect at token expiry.
 *
 * req.profile stays null for a uid in neither collection, which the callers already
 * handle as 403/404.
 */
async function ensureProfile(req) {
  if (!req.user?.uid) return null;
  if (req.profile !== undefined) return req.profile;

  const profile = await resolveProfile(req);
  req.profile = profile;
  if (!req.user.role) req.user.role = profile?.role ?? null;
  return profile;
}

const attachRole = async (req, res, next) => {
  try {
    await ensureProfile(req);
    next();
  } catch (err) {
    console.error("Failed to look up user role:", err.message);
    return res.status(403).json({ error: "Unable to verify permissions" });
  }
};

const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      await ensureProfile(req);
    } catch (err) {
      console.error("Failed to look up user role:", err.message);
      return res.status(403).json({ error: "Unable to verify permissions" });
    }

    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

const MULTER_ERROR_CODES = new Set([
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_TYPE",
  "LIMIT_UNEXPECTED_FILE",
  "LIMIT_PART_COUNT",
  "LIMIT_FIELD_KEY",
  "LIMIT_FIELD_VALUE",
  "LIMIT_FIELD_COUNT",
]);

const errorHandler = (err, req, res, _next) => {
  console.error("Server error:", err);
  const isDev = process.env.NODE_ENV === "development";
  const isMulterLimit = MULTER_ERROR_CODES.has(err.code);
  const status = err.status || err.statusCode || (isMulterLimit ? 400 : 500);
  const safeToShow = isDev || isMulterLimit || err.expose === true;
  res.status(status).json({
    error: safeToShow ? (err.message || "Internal server error") : "Internal server error",
  });
};

module.exports = { verifyToken, attachRole, authorize, errorHandler, isAccountActive };
