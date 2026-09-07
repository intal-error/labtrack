const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const ExcelJS = require("exceljs");
const QRCode = require("qrcode");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

const USERS = "users";

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const timeIn = async (req, res) => {
  try {
    const { schoolId, subject, professor, labRoom, roomCode } = req.body;
    if (!schoolId || !subject || !professor || !labRoom) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const userSnap = await db.collection(USERS).where("schoolId", "==", schoolId.trim()).limit(1).get();
    if (userSnap.empty) {
      return res.status(404).json({ error: "Student not found" });
    }
    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();

    const today = getTodayString();

    const { data: studentRecords, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("student_school_id", schoolId.trim());
    if (fetchError) throw fetchError;

    const activeSession = (studentRecords || []).find((r) => r.status === "active" && r.date === today);
    if (activeSession) {
      return res.status(400).json({ error: "Already timed in. Please time out first." });
    }

    const todayRecords = (studentRecords || []).filter((r) => r.date === today);
    if (todayRecords.length > 0) {
      const lastRecord = todayRecords.sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      })[0];
      const lastTime = new Date(lastRecord.created_at);
      if (!Number.isNaN(lastTime.getTime()) && (Date.now() - lastTime.getTime()) < 30000) {
        return res.status(400).json({ error: "Duplicate scan. Please wait a moment and try again." });
      }
    }

    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      student_school_id: schoolId.trim(),
      user_id: userDoc.id,
      first_name: userData.firstName || "",
      last_name: userData.lastName || "",
      school_id: userData.schoolId || schoolId.trim(),
      course: userData.course || "",
      year: userData.year || "",
      subject,
      professor,
      lab_room: labRoom,
      room_code: roomCode || "",
      date: today,
      time_in: now,
      time_out: null,
      total_duration: null,
      status: "active",
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from("lab_attendance")
      .insert(record)
      .select()
      .single();
    if (insertError) throw insertError;

    res.json({
      success: true,
      type: "time_in",
      record: created,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const timeOut = async (req, res) => {
  try {
    const { schoolId } = req.body;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    const today = getTodayString();

    const { data: studentRecords, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("student_school_id", schoolId.trim());
    if (fetchError) throw fetchError;

    const activeDoc = (studentRecords || []).find((r) => r.status === "active" && r.date === today);

    if (!activeDoc) {
      return res.status(400).json({ error: "No active session found. Please time in first." });
    }

    const timeInDate = new Date(activeDoc.time_in);
    if (Number.isNaN(timeInDate.getTime())) {
      return res.status(500).json({ error: "Invalid time-in record. Cannot calculate duration." });
    }
    const now = new Date();
    const durationMinutes = Math.round((now.getTime() - timeInDate.getTime()) / 60000);

    const nowIso = now.toISOString();
    const { error: updateError } = await supabase
      .from("lab_attendance")
      .update({
        time_out: nowIso,
        total_duration: durationMinutes,
        status: "timed_out",
        updated_at: nowIso,
      })
      .eq("id", activeDoc.id);
    if (updateError) throw updateError;

    res.json({
      success: true,
      type: "time_out",
      record: {
        ...activeDoc,
        time_out: nowIso,
        total_duration: durationMinutes,
        status: "timed_out",
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// --- Admin Endpoints ---

const getActiveStudents = async (req, res) => {
  try {
    const today = getTodayString();
    const { room } = req.query;

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("date", today)
      .eq("status", "active");
    if (error) throw error;

    let result = records || [];

    if (req.adminAssignment?.assignedCourse) {
      result = result.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    if (room) {
      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      result = result.filter((r) => norm(r.room_code) === norm(room));
    }

    result.sort((a, b) => {
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    const nowMs = Date.now();
    result = result.map((r) => {
      const timeInDate = new Date(r.time_in);
      const currentDuration = !Number.isNaN(timeInDate.getTime()) ? Math.round((nowMs - timeInDate.getTime()) / 60000) : 0;
      return { ...r, currentDuration };
    });

    res.json(transformKeys(result));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getTodayAttendance = async (req, res) => {
  try {
    const today = getTodayString();

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("date", today);
    if (error) throw error;

    let result = records || [];

    if (req.adminAssignment?.assignedCourse) {
      result = result.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    result.sort((a, b) => {
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    res.json(transformKeys(result));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getDailyLog = async (req, res) => {
  try {
    const { date } = req.params;
    if (!date) return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("date", date);
    if (error) throw error;

    let result = records || [];

    if (req.adminAssignment?.assignedCourse) {
      result = result.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    result.sort((a, b) => {
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tA - tB;
    });

    res.json(transformKeys(result));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getAttendanceHistory = async (req, res) => {
  try {
    const { from, to, course, year, subject, professor, labRoom, student, page = 1, limit = 50 } = req.query;

    let query = supabase.from("lab_attendance").select("*");
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data: records, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    let result = records || [];

    if (course) result = result.filter((r) => r.course === course);
    if (year) result = result.filter((r) => r.year === year);
    if (subject) result = result.filter((r) => r.subject === subject);
    if (professor) result = result.filter((r) => r.professor === professor);
    if (labRoom) result = result.filter((r) => r.lab_room === labRoom);
    if (student) {
      const s = student.toLowerCase();
      result = result.filter((r) =>
        (r.first_name || "").toLowerCase().includes(s) ||
        (r.last_name || "").toLowerCase().includes(s) ||
        (r.student_school_id || "").toLowerCase().includes(s)
      );
    }

    if (req.adminAssignment?.assignedCourse) {
      result = result.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    result.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    const total = result.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const start = (pageNum - 1) * limitNum;
    const paged = result.slice(start, start + limitNum);

    res.json({ records: transformKeys(paged), total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Room-specific attendance history
const getRoomAttendanceHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { from, to, student, year, course, page = 1, limit = 50 } = req.query;

    const { data: roomData, error: roomError } = await supabase
      .from("lab_rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (roomError || !roomData) return res.status(404).json({ error: "Room not found" });
    const roomCode = roomData.room_code;
    const roomName = roomData.room_name;

    const { data: allRecords, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*");
    if (fetchError) throw fetchError;

    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let roomRecords = (allRecords || []).filter((r) => norm(r.room_code) === norm(roomCode));

    const uniqueYears = [...new Set(roomRecords.map((r) => r.year).filter(Boolean))].sort();
    const uniqueCourses = [...new Set(roomRecords.map((r) => r.course).filter(Boolean))].sort();

    if (from) roomRecords = roomRecords.filter((r) => r.date >= from);
    if (to) roomRecords = roomRecords.filter((r) => r.date <= to);
    if (year) roomRecords = roomRecords.filter((r) => (r.year || "").toLowerCase() === year.toLowerCase());
    if (course) roomRecords = roomRecords.filter((r) => (r.course || "").toLowerCase() === course.toLowerCase());
    if (student) {
      const s = student.toLowerCase();
      roomRecords = roomRecords.filter((r) =>
        (r.first_name || "").toLowerCase().includes(s) ||
        (r.last_name || "").toLowerCase().includes(s) ||
        (r.student_school_id || "").toLowerCase().includes(s)
      );
    }

    roomRecords.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    const total = roomRecords.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const start = (pageNum - 1) * limitNum;
    const paged = roomRecords.slice(start, start + limitNum);

    res.json({ records: transformKeys(paged), total, page: pageNum, totalPages: Math.ceil(total / limitNum), roomName, years: uniqueYears, courses: uniqueCourses });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("student_school_id", schoolId);
    if (error) throw error;

    let result = records || [];

    result.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    const totalSessions = result.length;
    const totalTimeIn = result.filter((r) => r.status === "active").length;
    const totalMinutes = result.reduce((sum, r) => sum + (r.total_duration || 0), 0);

    res.json({
      records: transformKeys(result),
      summary: {
        totalSessions,
        totalTimeIn,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Student self-service: load own attendance (no admin auth required)
const getMyAttendance = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

    if (req.user?.uid) {
      const userDoc = await db.collection("users").doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const profile = userDoc.data();
      if (!profile.schoolId || profile.schoolId !== schoolId) {
        return res.status(403).json({ error: "Not authorized to view this record" });
      }
    }

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("student_school_id", schoolId);
    if (error) throw error;

    let result = records || [];

    result.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
      return tB - tA;
    });

    const totalSessions = result.length;
    const totalTimeIn = result.filter((r) => r.status === "active").length;
    const totalMinutes = result.reduce((sum, r) => sum + (r.total_duration || 0), 0);

    res.json({
      records: transformKeys(result),
      summary: {
        totalSessions,
        totalTimeIn,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getStats = async (req, res) => {
  try {
    const today = getTodayString();

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const [todayResult, activeResult, weekResult] = await Promise.all([
      supabase.from("lab_attendance").select("*").eq("date", today),
      supabase.from("lab_attendance").select("*").eq("date", today).eq("status", "active"),
      supabase.from("lab_attendance").select("*").gte("date", weekStartStr).lte("date", today),
    ]);

    if (todayResult.error) throw todayResult.error;
    if (activeResult.error) throw activeResult.error;
    if (weekResult.error) throw weekResult.error;

    let todayRecords = todayResult.data || [];
    if (req.adminAssignment?.assignedCourse) {
      todayRecords = todayRecords.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    let weekRecords = weekResult.data || [];
    if (req.adminAssignment?.assignedCourse) {
      weekRecords = weekRecords.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    const totalToday = todayRecords.length;
    const currentlyInside = (activeResult.data || []).length;
    const completedToday = todayRecords.filter((r) => r.status === "timed_out").length;
    const totalMinutesToday = todayRecords.reduce((sum, r) => sum + (r.total_duration || 0), 0);
    const uniqueStudents = new Set(weekRecords.map((d) => d.student_school_id)).size;

    res.json({
      currentlyInside,
      totalToday,
      completedToday,
      totalMinutesToday,
      uniqueStudentsThisWeek: uniqueStudents,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Record not found" });

    const allowed = ["subject", "professor", "lab_room", "room_code", "time_in", "time_out", "total_duration", "status"];
    const sanitized = {};
    const fieldMap = {
      subject: "subject",
      professor: "professor",
      labRoom: "lab_room",
      roomCode: "room_code",
      timeIn: "time_in",
      timeOut: "time_out",
      totalDuration: "total_duration",
      status: "status",
    };
    for (const key of allowed) {
      const bodyKey = Object.keys(fieldMap).find((k) => fieldMap[k] === key) || key;
      if (updates[bodyKey] !== undefined) sanitized[key] = updates[bodyKey];
      else if (updates[key] !== undefined) sanitized[key] = updates[key];
    }
    sanitized.updated_at = new Date().toISOString();

    if (sanitized.time_in || sanitized.time_out) {
      const tIn = new Date(sanitized.time_in || existing.time_in);
      const tOut = new Date(sanitized.time_out || existing.time_out);
      if (!Number.isNaN(tIn.getTime()) && !Number.isNaN(tOut.getTime())) {
        sanitized.total_duration = Math.round((tOut.getTime() - tIn.getTime()) / 60000);
      }
    }

    const { error: updateError } = await supabase
      .from("lab_attendance")
      .update(sanitized)
      .eq("id", id);
    if (updateError) throw updateError;

    const { data: updated } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("id", id)
      .single();
    res.json(transformKeys(updated));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("id")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Record not found" });

    const { error: deleteError } = await supabase.from("lab_attendance").delete().eq("id", id);
    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// --- Excel Export ---

const exportToExcel = async (req, res) => {
  try {
    const { from, to, course, year, subject, professor, labRoom, student, date } = req.query;

    const fromDate = date || from;
    const toDateVal = date || to;

    let query = supabase.from("lab_attendance").select("*");
    if (fromDate) query = query.gte("date", fromDate);
    if (toDateVal) query = query.lte("date", toDateVal);

    const { data: records, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    let result = records || [];

    if (course) result = result.filter((r) => r.course === course);
    if (year) result = result.filter((r) => r.year === year);
    if (subject) result = result.filter((r) => r.subject === subject);
    if (professor) result = result.filter((r) => r.professor === professor);
    if (labRoom) result = result.filter((r) => r.lab_room === labRoom);
    if (student) {
      const s = student.toLowerCase();
      result = result.filter((r) =>
        (r.first_name || "").toLowerCase().includes(s) ||
        (r.last_name || "").toLowerCase().includes(s) ||
        (r.student_school_id || "").toLowerCase().includes(s)
      );
    }

    if (req.adminAssignment?.assignedCourse) {
      result = result.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }

    result.sort((a, b) => {
      const dA = a.date || "";
      const dB = b.date || "";
      if (dA !== dB) return dA.localeCompare(dB);
      const tA = new Date(a.time_in || 0).getTime();
      const tB = new Date(b.time_in || 0).getTime();
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
    result.forEach((r) => {
      const name = `${r.first_name || ""} ${r.last_name || ""}`.trim() || "-";
      const status = r.status === "active" ? "Currently Inside" : "Timed Out";
      const duration = r.total_duration != null ? formatDuration(r.total_duration) : "-";
      sheet.addRow([
        r.date || "-",
        name,
        r.student_school_id || "-",
        r.course || "-",
        r.year || "-",
        r.subject || "-",
        r.professor || "-",
        r.lab_room || "-",
        formatTime(r.time_in),
        formatTime(r.time_out),
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
    const summaryRow = sheet.addRow(["", `Total Records: ${result.length}`, "", "", "", "", "", "", "", "", ""]);
    summaryRow.font = { bold: true, size: 10 };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=lab_attendance_${date || "report"}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// --- Room Management ---

const getRooms = async (req, res) => {
  try {
    const { data: rooms, error } = await supabase.from("lab_rooms").select("*");
    if (error) throw error;

    const sorted = (rooms || []).sort((a, b) => (a.room_name || "").localeCompare(b.room_name || ""));
    res.json(transformKeys(sorted));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createRoom = async (req, res) => {
  try {
    const { roomName, location } = req.body;
    if (!roomName) return res.status(400).json({ error: "Room name is required" });

    const roomCode = roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const qrData = `LABROOM:${roomName}`;

    const { data: existing } = await supabase
      .from("lab_rooms")
      .select("id")
      .eq("room_code", roomCode)
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "A room with this name already exists" });
    }

    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      room_name: roomName.trim(),
      room_code: roomCode,
      qr_data: qrData,
      location: (location || "").trim(),
      status: "active",
      created_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from("lab_rooms")
      .insert(record)
      .select()
      .single();
    if (insertError) throw insertError;

    res.json(transformKeys(created));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from("lab_rooms")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Room not found" });

    const allowed = ["roomName", "location", "status"];
    const sanitized = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }

    const updatePayload = {};
    if (sanitized.roomName !== undefined) {
      updatePayload.room_name = sanitized.roomName;
      updatePayload.room_code = sanitized.roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      updatePayload.qr_data = `LABROOM:${sanitized.roomName}`;
    }
    if (sanitized.location !== undefined) updatePayload.location = sanitized.location;
    if (sanitized.status !== undefined) updatePayload.status = sanitized.status;

    const { error: updateError } = await supabase
      .from("lab_rooms")
      .update(updatePayload)
      .eq("id", id);
    if (updateError) throw updateError;

    const { data: updated } = await supabase
      .from("lab_rooms")
      .select("*")
      .eq("id", id)
      .single();
    res.json(transformKeys(updated));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabase
      .from("lab_rooms")
      .select("id")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Room not found" });

    const { error: deleteError } = await supabase.from("lab_rooms").delete().eq("id", id);
    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getRoomQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: room, error: fetchError } = await supabase
      .from("lab_rooms")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !room) return res.status(404).json({ error: "Room not found" });

    const dataUrl = await QRCode.toDataURL(room.qr_data, {
      width: 300,
      margin: 2,
      color: { dark: "#002f17", light: "#ffffff" },
    });

    res.json({ dataUrl, roomName: room.room_name, qrData: room.qr_data });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getStudentQR = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ error: "Student ID is required" });

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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Auto-scan: detects time-in or time-out based on active session
const autoScan = async (req, res) => {
  try {
    const { schoolId, roomCode, labRoom, firstName, lastName, course, year, section, subject, professor } = req.body;

    if (!schoolId) {
      return res.json({
        type: "need_form",
        roomCode: roomCode || "",
        labRoom: labRoom || "Laboratory",
      });
    }

    const today = getTodayString();

    const { data: allRecords, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("student_school_id", schoolId.trim());
    if (fetchError) throw fetchError;

    const studentRecords = (allRecords || []).filter((r) => r.date === today);
    const activeSession = studentRecords.find((r) => r.status === "active");

    if (activeSession) {
      const timeInDate = new Date(activeSession.time_in);
      if (Number.isNaN(timeInDate.getTime())) {
        return res.status(500).json({ error: "Invalid time-in record. Cannot calculate duration." });
      }
      const now = new Date();
      const durationMinutes = Math.round((now.getTime() - timeInDate.getTime()) / 60000);

      const nowIso = now.toISOString();
      const { error: updateError } = await supabase
        .from("lab_attendance")
        .update({
          time_out: nowIso,
          total_duration: durationMinutes,
          status: "timed_out",
          updated_at: nowIso,
        })
        .eq("id", activeSession.id);
      if (updateError) throw updateError;

      return res.json({
        success: true,
        type: "time_out",
        record: {
          ...activeSession,
          time_out: nowIso,
          total_duration: durationMinutes,
          status: "timed_out",
        },
      });
    }

    // Dedup check
    if (studentRecords.length > 0) {
      const lastRecord = studentRecords.sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      })[0];
      const lastTime = new Date(lastRecord.created_at);
      if (!Number.isNaN(lastTime.getTime()) && (Date.now() - lastTime.getTime()) < 30000) {
        return res.status(400).json({ error: "Duplicate scan. Please wait a moment and try again." });
      }
    }

    // TIME IN — require form data
    if (!firstName || !lastName || !course || !year || !subject || !professor) {
      return res.status(400).json({ error: "All form fields are required for time-in." });
    }

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

    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      student_school_id: schoolId.trim(),
      user_id: verifiedUserId,
      first_name: verifiedFirstName,
      last_name: verifiedLastName,
      school_id: schoolId.trim(),
      course: verifiedCourse,
      year: year.trim(),
      section: (section || "").trim(),
      subject,
      professor: professor.trim(),
      lab_room: labRoom || "Laboratory",
      room_code: roomCode || "",
      date: today,
      time_in: now,
      time_out: null,
      total_duration: null,
      status: "active",
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from("lab_attendance")
      .insert(record)
      .select()
      .single();
    if (insertError) throw insertError;

    res.json({
      success: true,
      type: "time_in",
      record: created,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
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
