require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { verifyToken, authorize, errorHandler } = require("./src/middleware/auth");
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

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

if (process.env.NODE_ENV === "production" && allowedOrigins.includes("http://localhost:5173")) {
  console.warn("WARNING: CLIENT_URL not configured for production. Using localhost fallback.");
}

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: "Too many requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] General limit hit: ${req.user?.uid || req.ip} on ${req.method} ${req.originalUrl}`);
    res.status(429).json({ error: "Too many requests, please try again later" });
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: "Too many write requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] Write limit hit: ${req.user?.uid || req.ip} on ${req.method} ${req.originalUrl}`);
    res.status(429).json({ error: "Too many write requests, please try again later" });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] Auth limit hit: ${req.ip} on ${req.method} ${req.originalUrl}`);
    res.status(429).json({ error: "Too many authentication attempts, please try again later" });
  },
});

const attendanceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: "Too many attendance requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] Attendance limit hit: ${req.user?.uid || req.ip}`);
    res.status(429).json({ error: "Too many attendance requests, please try again later" });
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: "Too many upload requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] Upload limit hit: ${req.user?.uid || req.ip}`);
    res.status(429).json({ error: "Too many upload requests, please try again later" });
  },
});

const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: "Too many backup requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[RATE-LIMIT] Backup limit hit: ${req.user?.uid || req.ip}`);
    res.status(429).json({ error: "Too many backup requests, please try again later" });
  },
});

const methodAwareLimiter = (req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  return generalLimiter(req, res, next);
};

// Public routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/attendance", verifyToken, attendanceLimiter, attendanceRoutes);
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Protected routes (any authenticated user)
app.use("/api/catalog", verifyToken, methodAwareLimiter, catalogRoutes);
app.use("/api/transactions", verifyToken, methodAwareLimiter, transactionRoutes);
app.use("/api/users", verifyToken, methodAwareLimiter, userRoutes);
app.use("/api/notifications", verifyToken, methodAwareLimiter, notificationsRoutes);
app.use("/api/documents", verifyToken, authorize("admin"), methodAwareLimiter, documentsRoutes);
app.use("/api/reports", verifyToken, authorize("admin"), generalLimiter, reportRoutes);
app.use("/api/upload", verifyToken, uploadLimiter, uploadRoutes);
app.use("/api/maintenance", verifyToken, authorize("admin"), methodAwareLimiter, maintenanceRoutes);
app.use("/api/incidents", verifyToken, methodAwareLimiter, incidentRoutes);
app.use("/api/manuals", verifyToken, methodAwareLimiter, manualRoutes);
app.use("/api/fines", verifyToken, methodAwareLimiter, finesRoutes);
app.use("/api/backup", verifyToken, authorize("admin"), backupLimiter, backupRoutes);
app.use("/api/borrow-requests", verifyToken, methodAwareLimiter, borrowRequestRoutes);

// Admin-only routes
app.use("/api/admin", verifyToken, authorize("admin"), methodAwareLimiter, adminRoutes);
app.use("/api/settings", verifyToken, authorize("admin"), methodAwareLimiter, settingsRoutes);

// Error handler
app.use(errorHandler);

cron.schedule("*/30 * * * *", () => {
  console.log("Running overdue check...");
  checkOverdueTransactions().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
