const { db } = require("../config/firebase");
const ExcelJS = require("exceljs");
const QRCode = require("qrcode");

const ATTENDANCE = "labAttendance";
const USERS = "users";
const ROOMS = "labRooms";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(timestamp) {
  const d = toDate(timestamp);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(timestamp) {
  const d = toDate(timestamp);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// --- Public Kiosk Endpoints (no auth required) ---

const lookupStudent = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    const snap = await db.collection(USERS).where("schoolId", "==", schoolId.trim()).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ error: "Student not found" });
    }

    const doc = snap.docs[0];
    const data = doc.data();
    res.json({
      userId: doc.id,
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      schoolId: data.schoolId || "",
      course: data.course || "",
      year: data.year || "",
      section: data.section || "",
      email: data.email || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const timeIn = async (req, res) => {
  try {
    const { schoolId, subject, professor, labRoom, roomCode } = req.body;
    if (!schoolId || !subject || !professor || !labRoom) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Look up student
    const userSnap = await db.collection(USERS).where("schoolId", "==", schoolId.trim()).limit(1).get();
    if (userSnap.empty) {
      return res.status(404).json({ error: "Student not found" });
    }
    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();

    const today = getTodayString();

    // Check for existing active session today - fetch by studentSchoolId only, filter in memory
    const studentSnap = await db.collection(ATTENDANCE)
      .where("studentSchoolId", "==", schoolId.trim())
      .get();

    const studentRecords = studentSnap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));

    // Check for active session today
    const activeSession = studentRecords.find((r) => r.data.status === "active" && r.data.date === today);
    if (activeSession) {
      return res.status(400).json({ error: "Already timed in. Please time out first." });
    }

    // Dedup check: if same student scanned within 30 seconds today
    const todayRecords = studentRecords.filter((r) => r.data.date === today);
    if (todayRecords.length > 0) {
      const lastRecord = todayRecords.sort((a, b) => {
        const tA = toDate(a.data.createdAt)?.getTime() || 0;
        const tB = toDate(b.data.createdAt)?.getTime() || 0;
        return tB - tA;
      })[0];
      const lastTime = toDate(lastRecord.data.createdAt);
      if (lastTime && (Date.now() - lastTime.getTime()) < 30000) {
        return res.status(400).json({ error: "Duplicate scan. Please wait a moment and try again." });
      }
    }

    const now = new Date();
    const record = {
      studentSchoolId: schoolId.trim(),
      userId: userDoc.id,
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      schoolId: userData.schoolId || schoolId.trim(),
      course: userData.course || "",
      year: userData.year || "",
      subject,
      professor,
      labRoom,
      roomCode: roomCode || "",
      date: today,
      timeIn: now,
      timeOut: null,
      totalDuration: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(ATTENDANCE).add(record);

    res.json({
      success: true,
      type: "time_in",
      record: { id: docRef.id, ...record },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const timeOut = async (req, res) => {
  try {
    const { schoolId } = req.body;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    const today = getTodayString();

    // Find active session - fetch by studentSchoolId only, filter in memory
    const studentSnap = await db.collection(ATTENDANCE)
      .where("studentSchoolId", "==", schoolId.trim())
      .get();

    const activeDoc = studentSnap.docs.find((d) => {
      const data = d.data();
      return data.status === "active" && data.date === today;
    });

    if (!activeDoc) {
      return res.status(400).json({ error: "No active session found. Please time in first." });
    }

    const data = activeDoc.data();
    const timeInDate = toDate(data.timeIn);
    const now = new Date();
    if (!timeInDate) {
      return res.status(500).json({ error: "Invalid time-in record. Cannot calculate duration." });
    }
    const durationMinutes = Math.round((now.getTime() - timeInDate.getTime()) / 60000);

    await activeDoc.ref.update({
      timeOut: now,
      totalDuration: durationMinutes,
      status: "timed_out",
      updatedAt: now,
    });

    res.json({
      success: true,
      type: "time_out",
      record: {
        id: activeDoc.id,
        ...data,
        timeOut: now,
        totalDuration: durationMinutes,
        status: "timed_out",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Admin Endpoints ---

const getActiveStudents = async (req, res) => {
  try {
    const today = getTodayString();
    const { room } = req.query;

    // Fetch all records, filter in memory (avoids composite index requirement)
    const snap = await db.collection(ATTENDANCE).get();
    let records = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((r) => r.status === "active" && r.date === today);

    if (req.adminAssignment?.assignedCourse) {
      records = records.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    // Filter by room if specified
    if (room) {
      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      records = records.filter((r) => norm(r.roomCode) === norm(room));
    }

    records.sort((a, b) => {
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    // Calculate current duration for each
    const now = Date.now();
    records = records.map((r) => {
      const timeInDate = toDate(r.timeIn);
      const currentDuration = timeInDate ? Math.round((now - timeInDate.getTime()) / 60000) : 0;
      return { ...r, currentDuration };
    });

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTodayAttendance = async (req, res) => {
  try {
    const today = getTodayString();
    const snap = await db.collection(ATTENDANCE)
      .where("date", "==", today)
      .get();

    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (req.adminAssignment?.assignedCourse) {
      records = records.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    records.sort((a, b) => {
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDailyLog = async (req, res) => {
  try {
    const { date } = req.params;
    if (!date) return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });

    const snap = await db.collection(ATTENDANCE)
      .where("date", "==", date)
      .get();

    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (req.adminAssignment?.assignedCourse) {
      records = records.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    records.sort((a, b) => {
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tA - tB;
    });

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAttendanceHistory = async (req, res) => {
  try {
    const { from, to, course, year, subject, professor, labRoom, student, page = 1, limit = 50 } = req.query;

    // Fetch all records - single-field queries are fine, no composite index needed
    const snap = await db.collection(ATTENDANCE).get();
    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Apply all filters in memory
    if (from) records = records.filter((r) => r.date >= from);
    if (to) records = records.filter((r) => r.date <= to);
    if (course) records = records.filter((r) => r.course === course);
    if (year) records = records.filter((r) => r.year === year);
    if (subject) records = records.filter((r) => r.subject === subject);
    if (professor) records = records.filter((r) => r.professor === professor);
    if (labRoom) records = records.filter((r) => r.labRoom === labRoom);
    if (student) {
      const s = student.toLowerCase();
      records = records.filter((r) =>
        (r.firstName || "").toLowerCase().includes(s) ||
        (r.lastName || "").toLowerCase().includes(s) ||
        (r.studentSchoolId || "").toLowerCase().includes(s)
      );
    }

    if (req.adminAssignment?.assignedCourse) {
      records = records.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    // Sort by date desc, then time desc
    records.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    const total = records.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const start = (pageNum - 1) * limitNum;
    const paged = records.slice(start, start + limitNum);

    res.json({ records: paged, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Room-specific attendance history
const getRoomAttendanceHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { from, to, student, year, course, page = 1, limit = 50 } = req.query;

    // Look up the room to get its roomCode
    const roomDoc = await db.collection(ROOMS).doc(roomId).get();
    if (!roomDoc.exists) return res.status(404).json({ error: "Room not found" });
    const roomData = roomDoc.data();
    const roomCode = roomData.roomCode;
    const roomName = roomData.roomName;

    // Fetch all records, filter by roomCode in memory (single-field query)
    const snap = await db.collection(ATTENDANCE).get();
    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Filter by roomCode (normalize both sides to handle raw vs normalized mismatch)
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let roomRecords = records.filter((r) => norm(r.roomCode) === norm(roomCode));

    // Collect unique years and courses for filter dropdowns (before applying filters)
    const uniqueYears = [...new Set(roomRecords.map((r) => r.year).filter(Boolean))].sort();
    const uniqueCourses = [...new Set(roomRecords.map((r) => r.course).filter(Boolean))].sort();

    // Additional filters
    if (from) roomRecords = roomRecords.filter((r) => r.date >= from);
    if (to) roomRecords = roomRecords.filter((r) => r.date <= to);
    if (year) roomRecords = roomRecords.filter((r) => (r.year || "").toLowerCase() === year.toLowerCase());
    if (course) roomRecords = roomRecords.filter((r) => (r.course || "").toLowerCase() === course.toLowerCase());
    if (student) {
      const s = student.toLowerCase();
      roomRecords = roomRecords.filter((r) =>
        (r.firstName || "").toLowerCase().includes(s) ||
        (r.lastName || "").toLowerCase().includes(s) ||
        (r.studentSchoolId || "").toLowerCase().includes(s)
      );
    }

    // Sort by date desc, then time desc
    roomRecords.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    const total = roomRecords.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const start = (pageNum - 1) * limitNum;
    const paged = roomRecords.slice(start, start + limitNum);

    res.json({ records: paged, total, page: pageNum, totalPages: Math.ceil(total / limitNum), roomName, years: uniqueYears, courses: uniqueCourses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    const snap = await db.collection(ATTENDANCE)
      .where("studentSchoolId", "==", schoolId)
      .get();

    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    records.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    // Calculate summary stats
    const totalSessions = records.length;
    const totalTimeIn = records.filter((r) => r.status === "active").length;
    const totalMinutes = records.reduce((sum, r) => sum + (r.totalDuration || 0), 0);

    res.json({
      records,
      summary: {
        totalSessions,
        totalTimeIn,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Student self-service: load own attendance (no admin auth required)
const getMyAttendance = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    // Verify the authenticated user owns this schoolId
    if (req.user?.uid) {
      const userDoc = await db.collection("users").doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const profile = userDoc.data();
      if (profile.schoolId && profile.schoolId !== schoolId) {
        return res.status(403).json({ error: "Not authorized to view this record" });
      }
    }

    const snap = await db.collection(ATTENDANCE)
      .where("studentSchoolId", "==", schoolId)
      .get();

    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    records.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tB - tA;
    });

    const totalSessions = records.length;
    const totalTimeIn = records.filter((r) => r.status === "active").length;
    const totalMinutes = records.reduce((sum, r) => sum + (r.totalDuration || 0), 0);

    res.json({
      records,
      summary: {
        totalSessions,
        totalTimeIn,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getStats = async (req, res) => {
  try {
    const today = getTodayString();

    // Fetch all records, filter in memory (avoids composite index requirement)
    const snap = await db.collection(ATTENDANCE).get();
    let allRecords = snap.docs.map((d) => d.data());

    if (req.adminAssignment?.assignedCourse) {
      allRecords = allRecords.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    const todayRecords = allRecords.filter((r) => r.date === today);
    const activeRecords = allRecords.filter((r) => r.status === "active" && r.date === today);

    const totalToday = todayRecords.length;
    const currentlyInside = activeRecords.length;
    const completedToday = todayRecords.filter((r) => r.status === "timed_out").length;
    const totalMinutesToday = todayRecords.reduce((sum, r) => sum + (r.totalDuration || 0), 0);

    // Unique students this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekRecords = allRecords.filter((r) => r.date >= weekStartStr && r.date <= today);
    const uniqueStudents = new Set(weekRecords.map((d) => d.studentSchoolId)).size;

    res.json({
      currentlyInside,
      totalToday,
      completedToday,
      totalMinutesToday,
      uniqueStudentsThisWeek: uniqueStudents,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const doc = await db.collection(ATTENDANCE).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Record not found" });

    // Only allow certain fields to be updated
    const allowed = ["subject", "professor", "labRoom", "roomCode", "timeIn", "timeOut", "totalDuration", "status"];
    const sanitized = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }
    sanitized.updatedAt = new Date();

    // If timeIn or timeOut changed, recalculate duration
    if (sanitized.timeIn || sanitized.timeOut) {
      const data = doc.data();
      const tIn = toDate(sanitized.timeIn || data.timeIn);
      const tOut = toDate(sanitized.timeOut || data.timeOut);
      if (tIn && tOut) {
        sanitized.totalDuration = Math.round((tOut.getTime() - tIn.getTime()) / 60000);
      }
    }

    await doc.ref.update(sanitized);
    const updated = await doc.ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(ATTENDANCE).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Record not found" });
    await doc.ref.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Excel Export ---

const exportToExcel = async (req, res) => {
  try {
    const { from, to, course, year, subject, professor, labRoom, student, date } = req.query;

    // Fetch all records, filter in memory (avoids composite index requirement)
    const snap = await db.collection(ATTENDANCE).get();
    let records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Apply all filters in memory
    const fromDate = date || from;
    const toDateVal = date || to;
    if (fromDate) records = records.filter((r) => r.date >= fromDate);
    if (toDateVal) records = records.filter((r) => r.date <= toDateVal);
    if (course) records = records.filter((r) => r.course === course);
    if (year) records = records.filter((r) => r.year === year);
    if (subject) records = records.filter((r) => r.subject === subject);
    if (professor) records = records.filter((r) => r.professor === professor);
    if (labRoom) records = records.filter((r) => r.labRoom === labRoom);
    if (student) {
      const s = student.toLowerCase();
      records = records.filter((r) =>
        (r.firstName || "").toLowerCase().includes(s) ||
        (r.lastName || "").toLowerCase().includes(s) ||
        (r.studentSchoolId || "").toLowerCase().includes(s)
      );
    }

    if (req.adminAssignment?.assignedCourse) {
      records = records.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    // Sort
    records.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dA.localeCompare(dB);
      const tA = toDate(a.timeIn)?.getTime() || 0;
      const tB = toDate(b.timeIn)?.getTime() || 0;
      return tA - tB;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Lab Attendance");

    const headers = ["Date", "Student Name", "Student ID", "Course", "Year", "Subject", "Professor", "Lab Room", "Time-In", "Time-Out", "Total Duration", "Status"];
    const colWidths = [14, 24, 14, 10, 8, 28, 22, 22, 14, 14, 16, 14];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    // Title row
    sheet.spliceRows(1, 0, []);
    const titleRow = sheet.getRow(1);
    titleRow.getCell(1).value = "Laboratory Attendance Report";
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF2E7D32" } };
    titleRow.height = 30;
    sheet.mergeCells(1, 1, 1, headers.length);

    sheet.spliceRows(2, 0, []);
    const dateRow = sheet.getRow(2);
    const filterDesc = date ? `Date: ${date}` : from || to ? `From: ${from || "N/A"} To: ${to || "N/A"}` : "All Records";
    dateRow.getCell(1).value = `${filterDesc} | Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
    dateRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF888888" } };
    sheet.mergeCells(2, 1, 2, headers.length);

    // Header styling
    const headerRow = sheet.getRow(3);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 24;

    for (let i = 1; i <= headers.length; i++) {
      const col = sheet.getColumn(i);
      col.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    }

    // Data rows
    records.forEach((r) => {
      const name = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "-";
      const status = r.status === "active" ? "Currently Inside" : "Timed Out";
      const duration = r.totalDuration != null ? formatDuration(r.totalDuration) : "-";
      sheet.addRow([
        r.date || "-",
        name,
        r.studentSchoolId || "-",
        r.course || "-",
        r.year || "-",
        r.subject || "-",
        r.professor || "-",
        r.labRoom || "-",
        formatTime(r.timeIn),
        formatTime(r.timeOut),
        duration,
        status,
      ]);
    });

    // Data row styling
    for (let r = 4; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      row.alignment = { vertical: "middle" };
      if (r % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      }
      for (let c = 1; c <= headers.length; c++) {
        row.getCell(c).border = {
          top: { style: "thin", color: { argb: "FFEEEEEE" } },
          bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
          left: { style: "thin", color: { argb: "FFEEEEEE" } },
          right: { style: "thin", color: { argb: "FFEEEEEE" } },
        };
      }
    }

    // Summary row
    sheet.addRow([]);
    const summaryRow = sheet.addRow(["", `Total Records: ${records.length}`, "", "", "", "", "", "", "", "", ""]);
    summaryRow.font = { bold: true, size: 10 };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=lab_attendance_${date || "report"}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Room Management ---

const getRooms = async (req, res) => {
  try {
    const snap = await db.collection(ROOMS).get();
    const rooms = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    rooms.sort((a, b) => (a.roomName || "").localeCompare(b.roomName || ""));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createRoom = async (req, res) => {
  try {
    const { roomName, location } = req.body;
    if (!roomName) return res.status(400).json({ error: "Room name is required" });

    // Generate room code from name
    const roomCode = roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const qrData = `LABROOM:${roomName}`;

    // Check duplicate - fetch all rooms, filter in memory
    const existingSnap = await db.collection(ROOMS).where("roomCode", "==", roomCode).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ error: "A room with this name already exists" });
    }

    const now = new Date();
    const record = {
      roomName: roomName.trim(),
      roomCode,
      qrData,
      location: (location || "").trim(),
      status: "active",
      createdAt: now,
    };

    const docRef = await db.collection(ROOMS).add(record);
    res.json({ id: docRef.id, ...record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const doc = await db.collection(ROOMS).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Room not found" });

    const allowed = ["roomName", "location", "status"];
    const sanitized = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }

    if (sanitized.roomName) {
      sanitized.roomCode = sanitized.roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      sanitized.qrData = `LABROOM:${sanitized.roomName}`;
    }

    await doc.ref.update(sanitized);
    const updated = await doc.ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(ROOMS).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Room not found" });
    await doc.ref.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getRoomQR = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(ROOMS).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Room not found" });

    const data = doc.data();
    const dataUrl = await QRCode.toDataURL(data.qrData, {
      width: 300,
      margin: 2,
      color: { dark: "#002f17", light: "#ffffff" },
    });

    res.json({ dataUrl, roomName: data.roomName, qrData: data.qrData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getStudentQR = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    // Verify student exists
    const userSnap = await db.collection(USERS).where("schoolId", "==", schoolId).limit(1).get();
    if (userSnap.empty) {
      return res.status(404).json({ error: "Student not found" });
    }

    const userData = userSnap.docs[0].data();
    const qrData = `SLSU-STUDENT:${schoolId}`;
    const dataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: "#002f17", light: "#ffffff" },
    });

    res.json({
      dataUrl,
      studentName: `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
      schoolId,
      qrData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Auto-scan: detects time-in or time-out based on active session
// No schoolId → returns need_form; schoolId provided → detects time-in/time-out
const autoScan = async (req, res) => {
  try {
    const { schoolId, roomCode, labRoom, firstName, lastName, course, year, section, subject, professor } = req.body;

    // Step 1: Student just scanned room QR, no schoolId yet → return need_form
    if (!schoolId) {
      return res.json({
        type: "need_form",
        roomCode: roomCode || "",
        labRoom: labRoom || "Laboratory",
      });
    }

    const today = getTodayString();

    // Fetch student records for today (single-field query, no composite index needed)
    const studentSnap = await db.collection(ATTENDANCE)
      .where("studentSchoolId", "==", schoolId.trim())
      .get();
    const allRecords = studentSnap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
    const studentRecords = allRecords.filter((r) => r.data.date === today);

    // Check for active session today
    const activeSession = studentRecords.find((r) => r.data.status === "active");

    if (activeSession) {
      // TIME OUT
      const data = activeSession.data();
      const timeInDate = toDate(data.timeIn);
      const now = new Date();
      if (!timeInDate) {
        return res.status(500).json({ error: "Invalid time-in record. Cannot calculate duration." });
      }
      const durationMinutes = Math.round((now.getTime() - timeInDate.getTime()) / 60000);

      await activeSession.ref.update({
        timeOut: now,
        totalDuration: durationMinutes,
        status: "timed_out",
        updatedAt: now,
      });

      return res.json({
        success: true,
        type: "time_out",
        record: {
          id: activeSession.id,
          ...data,
          timeOut: now,
          totalDuration: durationMinutes,
          status: "timed_out",
        },
      });
    }

    // Dedup check: if same student scanned within 30 seconds today
    if (studentRecords.length > 0) {
      const lastRecord = studentRecords.sort((a, b) => {
        const tA = toDate(a.data.createdAt)?.getTime() || 0;
        const tB = toDate(b.data.createdAt)?.getTime() || 0;
        return tB - tA;
      })[0];
      const lastTime = toDate(lastRecord.data.createdAt);
      if (lastTime && (Date.now() - lastTime.getTime()) < 30000) {
        return res.status(400).json({ error: "Duplicate scan. Please wait a moment and try again." });
      }
    }

    // TIME IN — require form data
    if (!firstName || !lastName || !course || !year || !subject || !professor) {
      return res.status(400).json({ error: "All form fields are required for time-in." });
    }

    // Look up student profile from Firestore to verify data
    let verifiedUserId = "";
    let verifiedFirstName = firstName.trim();
    let verifiedLastName = lastName.trim();
    let verifiedCourse = course.trim();
    try {
      const usersSnap = await db.collection("users")
        .where("schoolId", "==", schoolId.trim())
        .limit(1)
        .get();
      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        verifiedUserId = userDoc.id;
        const profile = userDoc.data();
        verifiedFirstName = profile.firstName || verifiedFirstName;
        verifiedLastName = profile.lastName || verifiedLastName;
        verifiedCourse = profile.course || verifiedCourse;
      }
    } catch {
      // Profile lookup failed, use form data
    }

    const now = new Date();
    const record = {
      studentSchoolId: schoolId.trim(),
      userId: verifiedUserId,
      firstName: verifiedFirstName,
      lastName: verifiedLastName,
      schoolId: schoolId.trim(),
      course: verifiedCourse,
      year: year.trim(),
      section: (section || "").trim(),
      subject,
      professor: professor.trim(),
      labRoom: labRoom || "Laboratory",
      roomCode: roomCode || "",
      date: today,
      timeIn: now,
      timeOut: null,
      totalDuration: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(ATTENDANCE).add(record);

    res.json({
      success: true,
      type: "time_in",
      record: { id: docRef.id, ...record },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
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
};
