const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

/**
 * Every rate limiter in one place, so the policy is importable and testable
 * without booting the whole server (server.js calls app.listen on require).
 *
 * WHY: the QR endpoint used to sit behind `uploadLimiter` alongside the three
 * real upload routes, even though generating a QR code makes no outbound request
 * — it is a local QRCode.toDataURL call. That meant the per-item QR button in
 * Catalog silently consumed the same 15/hour budget that catalog photo uploads
 * depend on, so entering a batch of items could starve image uploads with
 * nothing in the UI to indicate why. `shouldSkipQr` makes that exemption
 * explicit policy instead of a routing accident.
 *
 * NOTE: these use the default in-memory store, so counters reset on every
 * restart and are per-instance. That is a known limitation, unchanged here —
 * it just means the effective ceiling varies with the number of instances and
 * the age of the process.
 */

/** Authenticated key when we have one, IP otherwise. */
const byUserOrIp = (req) => req.user?.uid || ipKeyGenerator(req.ip);

/** Compact factory so each limiter differs only in what actually matters. */
function limiter({ windowMs, max, message, logLabel, key = byUserOrIp, skip }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(key ? { keyGenerator: key } : {}),
    ...(skip ? { skip } : {}),
    message: { error: message },
    handler: (req, res) => {
      // The method and URL stay in the log line on purpose. A 429 is one of the
      // few failures an admin can actually cause, so "which endpoint" is the
      // first thing anyone reading the log needs to know — general, write and
      // auth all carried this suffix before the limiters moved into this module.
      console.warn(`[RATE-LIMIT] ${logLabel} limit hit: ${req.user?.uid || req.ip} on ${req.method} ${req.originalUrl}`);
      res.status(429).json({ error: message });
    },
  });
}

const generalLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later",
  logLabel: "General",
});

const writeLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many write requests, please try again later",
  logLabel: "Write",
});

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later",
  logLabel: "Auth",
  key: null,
});

const attendanceLimiter = limiter({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Too many attendance requests, please try again later",
  logLabel: "Attendance",
});

/**
 * POST /api/upload/qr performs no upload, so it must not consume an upload
 * slot. `req.path` is relative to the /api/upload mount point, hence "/qr".
 */
function shouldSkipQr(req) {
  return req.path === "/qr" || req.path === "/qr/";
}

const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: "Too many upload requests, please try again later",
  logLabel: "Upload",
  skip: shouldSkipQr,
});

/**
 * Its own bucket, deliberately — this is the third arrangement, and the first
 * two each broke something:
 *
 *  - under uploadLimiter: every per-item QR print spent one of the 15/hour
 *    photo-upload slots, so entering a batch of items starved image uploads.
 *  - skipped by uploadLimiter with nothing else: the endpoint had no ceiling at
 *    all, on a route with no input validation.
 *  - under generalLimiter: generalLimiter is a single instance shared by all 13
 *    read endpoints (methodAwareLimiter hands it to every GET), so printing QR
 *    labels drew down the same 100/15min pool as ordinary page loads and could
 *    throttle normal browsing.
 *
 * Isolating it means QR traffic can never starve uploads or reads, and is still
 * bounded. 60/15min covers printing a full inventory's labels in one sitting.
 */
const qrLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many QR requests, please try again later",
  logLabel: "QR",
});

const backupLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many backup requests, please try again later",
  logLabel: "Backup",
});

/** Writes are capped harder than reads; everything else uses the general ceiling. */
const methodAwareLimiter = (req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  return generalLimiter(req, res, next);
};

module.exports = {
  generalLimiter,
  writeLimiter,
  authLimiter,
  attendanceLimiter,
  uploadLimiter,
  qrLimiter,
  backupLimiter,
  methodAwareLimiter,
  shouldSkipQr,
};