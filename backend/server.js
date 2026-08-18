require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
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
const { checkOverdueTransactions } = require("./src/utils/overdueChecker");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Public routes
app.use("/api/auth", authRoutes);
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Protected routes (any authenticated user)
app.use("/api/catalog", verifyToken, catalogRoutes);
app.use("/api/transactions", verifyToken, transactionRoutes);
app.use("/api/users", verifyToken, userRoutes);
app.use("/api/notifications", verifyToken, notificationsRoutes);
app.use("/api/documents", verifyToken, documentsRoutes);
app.use("/api/reports", verifyToken, reportRoutes);
app.use("/api/upload", verifyToken, uploadRoutes);
app.use("/api/maintenance", verifyToken, maintenanceRoutes);
app.use("/api/incidents", verifyToken, incidentRoutes);
app.use("/api/manuals", verifyToken, manualRoutes);

// Admin-only routes
app.use("/api/admin", verifyToken, authorize("admin"), adminRoutes);
app.use("/api/settings", verifyToken, authorize("admin"), settingsRoutes);

// Error handler
app.use(errorHandler);

cron.schedule("*/30 * * * *", () => {
  console.log("Running overdue check...");
  checkOverdueTransactions().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
