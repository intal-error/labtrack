const express = require("express");
const router = express.Router();
const { verifyToken, authorize } = require("../middleware/auth");
const {
  lookupStudent,
  timeIn,
  timeOut,
  autoScan,
  getActiveStudents,
  getTodayAttendance,
  getDailyLog,
  getAttendanceHistory,
  getStudentAttendance,
  getMyAttendance,
  getRoomAttendanceHistory,
  getStats,
  updateRecord,
  deleteRecord,
  exportToExcel,
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomQR,
  getStudentQR,
} = require("../controllers/attendanceController");

// Public kiosk routes (no auth)
router.post("/time-in", timeIn);
router.post("/time-out", timeOut);
router.post("/auto-scan", autoScan);
router.get("/lookup-student/:schoolId", lookupStudent);

// Student self-service routes (any authenticated user)
router.get("/my/:schoolId", verifyToken, getMyAttendance);

// Admin-only routes
router.get("/active", verifyToken, authorize("admin"), getActiveStudents);
router.get("/today", verifyToken, authorize("admin"), getTodayAttendance);
router.get("/daily-log/:date", verifyToken, authorize("admin"), getDailyLog);
router.get("/history", verifyToken, authorize("admin"), getAttendanceHistory);
router.get("/student/:schoolId", verifyToken, authorize("admin"), getStudentAttendance);
router.get("/stats", verifyToken, authorize("admin"), getStats);
router.get("/export", verifyToken, authorize("admin"), exportToExcel);

// Room-specific attendance (admin) — must be before /:id catch-all
router.get("/room/:roomId/history", verifyToken, authorize("admin"), getRoomAttendanceHistory);

// Room management (admin) — must be before /:id catch-all
router.get("/rooms", verifyToken, authorize("admin"), getRooms);
router.post("/rooms", verifyToken, authorize("admin"), createRoom);
router.put("/rooms/:id", verifyToken, authorize("admin"), updateRoom);
router.delete("/rooms/:id", verifyToken, authorize("admin"), deleteRoom);
router.get("/rooms/:id/qr", verifyToken, authorize("admin"), getRoomQR);

// Student QR generation (admin)
router.get("/student-qr/:schoolId", verifyToken, authorize("admin"), getStudentQR);

router.put("/:id", verifyToken, authorize("admin"), updateRecord);
router.delete("/:id", verifyToken, authorize("admin"), deleteRecord);

module.exports = router;
