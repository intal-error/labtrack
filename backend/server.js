require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const catalogRoutes = require("./src/routes/catalog");
const transactionRoutes = require("./src/routes/transactions");
const userRoutes = require("./src/routes/users");
const adminRoutes = require("./src/routes/admin");
const reportRoutes = require("./src/routes/reports");
const uploadRoutes = require("./src/routes/upload");
const { checkOverdueTransactions } = require("./src/utils/overdueChecker");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use("/api/catalog", catalogRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

cron.schedule("*/30 * * * *", () => {
  console.log("Running overdue check...");
  checkOverdueTransactions().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
