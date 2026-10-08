const { auth, db } = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  // Idempotent on purpose. server.js:125 already runs this for every /api/attendance
  // request, and then routes/attendance.js ran it again on all sixteen routes --
  // so each admin attendance call paid two RSA-2048 signature verifications plus
  // (on a cold key cache) two public-key fetches. Re-verifying a token that is
  // already attached cannot change the answer, it can only cost latency.
  if (req.user?.uid) return next();

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const token = header.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
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

module.exports = { verifyToken, attachRole, authorize, errorHandler };
