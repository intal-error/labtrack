const express = require("express");
const router = express.Router();
// verifyToken is no longer imported here: server.js:125 already runs it for every
// /api/attendance request, and this router ran it a second time on all twenty
// routes below. Each duplicate cost an RSA-2048 signature verification (and, on a
// cold key cache, a public-key fetch) for an answer that could not change.
// attachRole/authorize also verify, so dropping it here is safe on its own.
const { authorize, attachRole } = require("../middleware/auth");
const {
  lookupStudent,
  timeIn,
  timeOut,
  autoScan,
  getActiveStudents,
  getTodayAttendance,
  getAttendanceFacets,
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
router.get("/my/:schoolId", attachRole, getMyAttendance);

// Admin-only routes
router.get("/active", authorize("admin"), getActiveStudents);
router.get("/facets", authorize("admin"), getAttendanceFacets);
router.get("/today", authorize("admin"), getTodayAttendance);
router.get("/daily-log/:date", authorize("admin"), getDailyLog);
router.get("/history", authorize("admin"), getAttendanceHistory);
router.get("/student/:schoolId", authorize("admin"), getStudentAttendance);
router.get("/stats", authorize("admin"), getStats);
router.get("/export", authorize("admin"), exportToExcel);

// Room-specific attendance (admin) — must be before /:id catch-all
router.get("/room/:roomId/history", authorize("admin"), getRoomAttendanceHistory);

// Room management (admin) — must be before /:id catch-all
router.get("/rooms", authorize("admin"), getRooms);
router.post("/rooms", authorize("admin"), createRoom);
router.put("/rooms/:id", authorize("admin"), updateRoom);
router.delete("/rooms/:id", authorize("admin"), deleteRoom);
router.get("/rooms/:id/qr", authorize("admin"), getRoomQR);

// Student QR generation (admin)
router.get("/student-qr/:schoolId", authorize("admin"), getStudentQR);

router.put("/:id", authorize("admin"), updateRecord);
router.delete("/:id", authorize("admin"), deleteRecord);

module.exports = router;
