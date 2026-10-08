const router = require("express").Router();
const { register, getProfile, updateProfile, changePassword } = require("../controllers/authController");
const { invalidateProfileUrl } = require("../controllers/transactionController");
const { verifyToken } = require("../middleware/auth");
const { validate, registerSchema } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimits");

// WHY THE LIMITER LIVES HERE, NOT IN server.js
//
// authLimiter existed as `app.use("/api/auth/register", authLimiter)` in server.js,
// registered AFTER `app.use("/api/auth", authRoutes)`. Express dispatches in
// registration order, so this router answered POST /register and ended the response
// before the limiter was ever consulted: register and password were UNLIMITED, while
// the comment above the mount claimed they were limited. A rate limiter that is
// mounted after the handler it protects is not a rate limiter.
//
// Attaching it to the route itself makes the ordering impossible to get wrong, and
// keeps the policy next to the endpoints it describes.
//
// Scope, deliberately narrow: only the two routes that accept credentials. GET
// /profile is NOT limited, because it is now read once per app load to resolve the
// role, and a shared-NAT lab (one IP for a whole building) could spend the whole
// 20-per-15min budget on profile reads and lock out the entire building's logins.
// Login does not appear here at all -- Firebase Auth handles it client-side.
router.post("/register", authLimiter, validate(registerSchema), register);
router.get("/profile", verifyToken, getProfile);
// invalidateProfileUrl first: replacing the profile photo writes a new profileURL to
// Firestore, and transactionController memoises those for five minutes. Without this
// the Transactions table would keep showing the old avatar until the TTL expired.
//
// NOTE: this was briefly registered TWICE (once with, once without the invalidator).
// Harmless only because updateProfile never calls next(), so Express stopped at the
// first match -- but the duplicate was a live landmine: the moment anything in the
// chain called next(), every profile update would have fired twice (two Firestore
// merges, two auth.updateUser calls, then ERR_HTTP_HEADERS_SENT).
router.put("/profile", verifyToken, invalidateProfileUrl, updateProfile);
// Limiter before verifyToken so an unauthenticated flood is rejected without paying
// for signature verification on every request.
router.put("/password", authLimiter, verifyToken, changePassword);

module.exports = router;
