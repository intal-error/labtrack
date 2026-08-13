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
const recordsRoutes = require("./src/routes/records");
const classesRoutes = require("./src/routes/classes");
const notificationsRoutes = require("./src/routes/notifications");
const documentsRoutes = require("./src/routes/documents");
const { checkOverdueTransactions } = require("./src/utils/overdueChecker");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

// Public routes
app.use("/api/auth", authRoutes);
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Protected routes (any authenticated user)
app.use("/api/catalog", verifyToken, catalogRoutes);
app.use("/api/transactions", verifyToken, transactionRoutes);
app.use("/api/users", verifyToken, userRoutes);
app.use("/api/records", verifyToken, recordsRoutes);
app.use("/api/classes", verifyToken, classesRoutes);
app.use("/api/notifications", verifyToken, notificationsRoutes);
app.use("/api/documents", verifyToken, documentsRoutes);
app.use("/api/reports", verifyToken, reportRoutes);
app.use("/api/upload", verifyToken, uploadRoutes);

// Admin-only routes
app.use("/api/admin", verifyToken, authorize("admin"), adminRoutes);

// Error handler
app.use(errorHandler);

cron.schedule("*/30 * * * *", () => {
  console.log("Running overdue check...");
  checkOverdueTransactions().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
