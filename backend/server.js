require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cron = require("node-cron");
const { verifyToken, authorize, errorHandler } = require("./src/middleware/auth");
const {
  generalLimiter,
  attendanceLimiter,
  uploadLimiter,
  backupLimiter,
  methodAwareLimiter,
} = require("./src/middleware/rateLimits");
const { kioskAuth } = require("./src/middleware/kioskAuth");
const authRoutes = require("./src/routes/auth");
const catalogRoutes = require("./src/routes/catalog");
const transactionRoutes = require("./src/routes/transactions");
const userRoutes = require("./src/routes/users");
const adminRoutes = require("./src/routes/admin");
const reportRoutes = require("./src/routes/reports");
const uploadRoutes = require("./src/routes/upload");
const notificationsRoutes = require("./src/routes/notifications");
const settingsRoutes = require("./src/routes/settings");
const documentsRoutes = require("./src/routes/documents");
const maintenanceRoutes = require("./src/routes/maintenance");
const incidentRoutes = require("./src/routes/incidents");
const manualRoutes = require("./src/routes/manuals");
const finesRoutes = require("./src/routes/fines");
const backupRoutes = require("./src/routes/backup");
const borrowRequestRoutes = require("./src/routes/borrowRequests");
const attendanceRoutes = require("./src/routes/attendance");

const { checkOverdueTransactions } = require("./src/utils/overdueChecker");
const { cache, cacheKey } = require("./src/utils/cache");

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Env vars whose absence breaks a whole feature rather than a single request.
 *
 * WHY: every one of these is declared `sync: false` in render.yaml, which means
 * Render never receives it from the repo and it has to be typed into the
 * dashboard by hand. backend/.env is gitignored, so a deploy that skipped one
 * of them boots cleanly and looks healthy: /api/health only ever checked
 * Supabase, so a missing CLOUDINARY_CLOUD_NAME took down image uploads on
 * Catalog, Maintenance, Incidents and Profile while the service reported "ok".
 *
 * Logging these once at boot turns a silent misconfiguration into the first
 * line of the deploy log. Nothing here exits the process — taking the service
 * down over an unset key would lock every user out of login for a feature they
 * may not even be using.
 */
const REQUIRED_ENV = [
  ["SUPABASE_URL", "all application data"],
  ["SUPABASE_SERVICE_KEY", "all application data"],
  ["FIREBASE_PROJECT_ID", "authentication"],
  ["FIREBASE_CLIENT_EMAIL", "authentication"],
  ["FIREBASE_PRIVATE_KEY", "authentication"],
];

// Checked separately: these gate file uploads only, so they degrade one feature
// instead of the whole app and are reported as a warning rather than an error.
const IMAGE_ENV = [
  ["CLOUDINARY_CLOUD_NAME", "image and document uploads"],
  ["CLOUDINARY_UPLOAD_PRESET", "image and document uploads"],
];

function reportMissingEnv(label, entries, log) {
  const missing = entries.filter(([key]) => !process.env[key]?.trim());
  if (!missing.length) return [];
  log(`\n${label}`);
  for (const [key, purpose] of missing) log(`  - ${key} is not set (needed for ${purpose})`);
  log("");
  return missing.map(([key]) => key);
}

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

if (process.env.NODE_ENV === "production" && allowedOrigins.includes("http://localhost:5173")) {
  console.warn("WARNING: CLIENT_URL not configured for production. Using localhost fallback.");
}

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// In-memory cache for read-heavy endpoints (30s default TTL)
function cacheMiddleware(ttl = 30) {
  return (req, res, next) => {
    if (req.method !== "GET") return next();
    const key = cacheKey(req);
    const cached = cache.get(key);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, body, ttl);
        res.set("X-Cache", "MISS");
      }
      return originalJson(body);
    };
    next();
  };
}

// Public routes
//
// authLimiter is deliberately NOT on this mount. It exists to slow credential
// guessing (20 requests / 15 min, keyed by IP), and a signed-in user re-reading
// their own profile is not that threat model -- but the client now calls
// GET /api/auth/profile once per app load to resolve its role, so mounting the
// limiter here meant a shared-NAT lab (one IP for a whole building) could spend the
// entire login budget on profile reads and lock everyone out.
//
// The two routes that DO take credentials, /register and /password, apply
// authLimiter themselves in src/routes/auth.js. It used to be mounted from here
// instead, on lines AFTER this one -- which meant Express had already dispatched
// into this router and produced a response by the time the limiter ran, so those
// two endpoints were effectively unlimited while the comment claimed otherwise.
app.use("/api/auth", authRoutes);

// Public attendance kiosk routes (kiosk-authenticated)
app.use("/api/attendance", attendanceLimiter, (req, res, next) => {
  const publicPaths = ["/time-in", "/time-out", "/auto-scan"];
  const isLookup = req.path.startsWith("/lookup-student/");
  if (publicPaths.includes(req.path) || isLookup) {
    return kioskAuth(req, res, next);
  }
  return verifyToken(req, res, next);
}, attendanceRoutes);
app.get("/api/health", async (req, res) => {
  const health = { status: "ok", timestamp: new Date().toISOString() };
  try {
    const { supabase } = require("./src/config/supabase");
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (error) throw error;
    health.database = "connected";
  } catch {
    health.status = "degraded";
    health.database = "disconnected";
  }

  // Storage is reported separately from `status` on purpose. Cloudinary being
  // unconfigured does not mean the service is unhealthy — login, borrowing and
  // attendance all still work — so folding it into `status` would make Render
  // restart a perfectly good service. Surfacing it as its own field instead
  // means the one thing that cannot be diagnosed from the UI is at least
  // visible in a health check. Never echo the values, only whether they exist.
  const imageEnvMissing = IMAGE_ENV.filter(([key]) => !process.env[key]?.trim()).map(([key]) => key);
  health.storage = imageEnvMissing.length ? "not_configured" : "configured";
  if (imageEnvMissing.length) health.storageMissing = imageEnvMissing;

  res.json(health);
});

// Protected routes (any authenticated user)
//
// NOTE ON THE /api/transactions CACHE: it is deliberately ABSENT. Nothing on that
// router invalidates a cached transactions response, and the endpoint's data changes
// on the very actions a user is watching (borrow, return, admin approve). A cached
// list here would show a student their loan as still open after signing it out. The
// read cost was addressed in queryTransactions instead -- indexed predicates,
// server-side sort, an explicit column list -- which is a fix that cannot go stale.
//
// /api/attendance is absent for the same reason: time-in and time-out write the same
// table the admin KPI tiles read, every 30 seconds, and the figures are wrong if they
// lag by even one poll interval.
app.use("/api/catalog", verifyToken, methodAwareLimiter, cacheMiddleware(30), catalogRoutes);
app.use("/api/transactions", verifyToken, methodAwareLimiter, transactionRoutes);
app.use("/api/users", verifyToken, methodAwareLimiter, userRoutes);
app.use("/api/notifications", verifyToken, methodAwareLimiter, notificationsRoutes);
app.use("/api/documents", verifyToken, authorize("admin"), methodAwareLimiter, documentsRoutes);
app.use("/api/reports", verifyToken, authorize("admin"), generalLimiter, cacheMiddleware(15), reportRoutes);
app.use("/api/upload", verifyToken, uploadLimiter, uploadRoutes);
app.use("/api/maintenance", verifyToken, authorize("admin"), methodAwareLimiter, cacheMiddleware(30), maintenanceRoutes);
app.use("/api/incidents", verifyToken, methodAwareLimiter, cacheMiddleware(15), incidentRoutes);
app.use("/api/manuals", verifyToken, methodAwareLimiter, cacheMiddleware(60), manualRoutes);
app.use("/api/fines", verifyToken, methodAwareLimiter, cacheMiddleware(15), finesRoutes);
app.use("/api/backup", verifyToken, authorize("admin"), backupLimiter, backupRoutes);
app.use("/api/borrow-requests", verifyToken, methodAwareLimiter, cacheMiddleware(15), borrowRequestRoutes);

// Admin-only routes
app.use("/api/admin", verifyToken, authorize("admin"), methodAwareLimiter, adminRoutes);
app.use("/api/settings", verifyToken, authorize("admin"), methodAwareLimiter, cacheMiddleware(60), settingsRoutes);

// 404 handler for undefined routes
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use(errorHandler);

cron.schedule("*/30 * * * *", () => {
  console.log("Running overdue check...");
  checkOverdueTransactions().catch(console.error);
});

// Startup config summary. Evaluated once, after every route is mounted, so a
// blank env var shows up in the deploy log before the first request arrives.
// Deliberately not labelled FATAL: nothing exits, so a reader who took the word
// literally would expect the process to be down rather than serving requests
// that fail one endpoint at a time. Plain ASCII only, so the line renders
// correctly in whatever log viewer reads it.
reportMissingEnv("ERROR: required configuration is missing, the matching feature will fail at request time:", REQUIRED_ENV, console.error);
const missingImageEnv = reportMissingEnv(
  "WARNING: image/document uploads will fail until these are set:",
  IMAGE_ENV,
  console.warn
);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (missingImageEnv.length) {
    console.log(
      `Storage: NOT CONFIGURED (${missingImageEnv.join(", ")}) - /api/upload/* will return 503`
    );
  }
});

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
