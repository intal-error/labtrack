const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const ExcelJS = require("exceljs");
const QRCode = require("qrcode");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const {
  applyAttendanceFilters,
  applyAssignedCourse,
  sortAttendance,
  sortAttendanceAsc,
  facet,
  describeAttendanceFilters,
  normRoom,
} = require("../utils/attendanceFilters");
const { slug } = require("../utils/exportUtils");

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

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The display name to store in lab_attendance.lab_room, resolved from
 * lab_rooms by room_code.
 *
 * The kiosk sends both roomCode and labRoom derived from the name embedded in
 * the scanned QR (AttendanceKioskPage.jsx:143-144). Because a rename leaves
 * qr_data frozen -- it must, or the slug the kiosk derives would change and
 * split the room's history -- that embedded name is the room's ORIGINAL name.
 * Storing it verbatim would therefore stamp every future record with a stale
 * room name, which then surfaced in the Today's Log Room column, the student
 * cards, the student attendance panel and the dashboard.
 *
 * So: room_code stays the stable join key (frozen), and lab_room is looked up
 * fresh from the room record, which always carries the current name.
 *
 * Fails soft to the client-supplied name when the room is unknown or the lookup
 * errors, so a missing lab_rooms row degrades to the old behaviour instead of
 * blocking a student's time-in.
 */
async function resolveLabRoom(roomCode, fallback) {
  if (!roomCode) return fallback || "Laboratory";
  try {
    const { data, error } = await supabase
      .from("lab_rooms")
      .select("room_name")
      .eq("room_code", roomCode)
      .limit(1);
    if (error) throw error;
    return (data && data[0] && data[0].room_name) || fallback || "Laboratory";
  } catch {
    return fallback || "Laboratory";
  }
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
      section: userData.section || "",
      subject,
      professor,
      lab_room: await resolveLabRoom(roomCode, labRoom),
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
      record: transformKeys(created),
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const timeOut = async (req, res) => {
  try {
    const { schoolId, roomCode } = req.body;
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

    if (activeDoc.room_code && !roomCode) {
      return res.status(400).json({ error: "Room code is required for sign-out." });
    }

    if (roomCode && activeDoc.room_code) {
      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (norm(roomCode) !== norm(activeDoc.room_code)) {
        return res.status(400).json({
          error: `Cannot sign out from a different room. Please sign out from ${activeDoc.lab_room || "the correct room"}.`,
        });
      }
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
        ...transformKeys(activeDoc),
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
    const { course, year, section, subject, professor, labRoom, roomCode, student } = req.query;

    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("*")
      .eq("date", today);
    if (error) throw error;

    const scoped = applyAssignedCourse(records || [], req.adminAssignment);
    const result = applyAttendanceFilters(scoped, { course, year, section, subject, professor, labRoom, roomCode, student });

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

const getAttendanceFacets = async (req, res) => {
  try {
    const { data: records, error } = await supabase
      .from("lab_attendance")
      .select("course,year,section,subject,professor,lab_room,room_code");
    if (error) throw error;

    const scoped = applyAssignedCourse(records || [], req.adminAssignment);

    res.json({
      courses: facet(scoped, "course"),
      years: facet(scoped, "year"),
      sections: facet(scoped, "section"),
      subjects: facet(scoped, "subject"),
      professors: facet(scoped, "professor"),
      rooms: [...new Set(scoped.map((r) => r.lab_room || r.room_code).filter(Boolean))].sort(),
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getAttendanceHistory = async (req, res) => {
  try {
    const { from, to, course, year, section, subject, professor, labRoom, student, page = 1, limit = 50 } = req.query;

    let query = supabase.from("lab_attendance").select("*");
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data: records, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const result = applyAssignedCourse(
      applyAttendanceFilters(records || [], { from, to, course, year, section, subject, professor, labRoom, student }),
      req.adminAssignment
    );

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
    const { from, to, student, year, course, section, subject, professor, page = 1, limit = 50 } = req.query;

    const { data: roomData, error: roomError } = await supabase
      .from("lab_rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (roomError || !roomData) return res.status(404).json({ error: "Room not found" });
    const roomCode = roomData.room_code;
    const roomName = roomData.room_name;

    // Guards rooms stored before createRoom rejected unslugifiable names. With
    // room_code "" the normRoom comparison below matches every row in the
    // building that has no room_code, merging unrelated rooms into one history.
    // Better a clear error than silently wrong data.
    if (!roomCode) {
      return res.status(400).json({ error: "This room has no usable identifier. Rename it to one containing letters or numbers." });
    }

    const { data: allRecords, error: fetchError } = await supabase
      .from("lab_attendance")
      .select("*");
    if (fetchError) throw fetchError;

    const norm = normRoom;
    let roomRecords = (allRecords || []).filter((r) => norm(r.room_code) === norm(roomCode));

    // Scoped admins must not see other courses' students here. Every other
    // attendance reader already calls this — getTodayAttendance,
    // getAttendanceFacets, getAttendanceHistory and exportToExcel — and this
    // endpoint was the single omission. That caused two problems at once:
    // a data leak (other courses' names and IDs on screen), and a silent
    // table/export mismatch, because exportToExcel DOES apply the assignment.
    // Filtering to a different course produced an empty workbook while the
    // table above showed rows; filtering to a year produced fewer rows than
    // the screen. With this in place the two agree.
    //
    // Applied BEFORE the facet() calls on purpose: scoping afterwards would
    // leave the dropdowns offering courses this admin may not see, and
    // selecting one would return nothing — reproducing the same symptom in a
    // new place. Scoping first means every filter list only contains values the
    // admin is allowed to query.
    roomRecords = applyAssignedCourse(roomRecords, req.adminAssignment);

    // Facets are computed BEFORE filtering, on purpose: the dropdown options
    // then stay stable while the user narrows the list, instead of collapsing
    // down to the one value still selected.
    const uniqueYears = facet(roomRecords, "year");
    const uniqueCourses = facet(roomRecords, "course");
    const uniqueSections = facet(roomRecords, "section");
    const uniqueSubjects = facet(roomRecords, "subject");
    const uniqueProfessors = facet(roomRecords, "professor");

    // Shared helper rather than a second, hand-rolled filter chain. It already
    // supports subject and professor (plus room scoping) and compares from/to
    // on the calendar day via dayKey, where a raw string compare silently drops
    // the boundary day whenever `from` carries a time component.
    roomRecords = applyAttendanceFilters(roomRecords, { from, to, student, year, course, section, subject, professor });
    roomRecords = sortAttendance(roomRecords);

    // Aggregates over the whole FILTERED set, not the page being returned.
    // Free: the array above is already fully materialised, so this costs no
    // extra query. The UI labels these "across the current filters" because
    // that is precisely what they describe.
    const totalMinutes = roomRecords.reduce((sum, r) => sum + (r.total_duration || 0), 0);
    const completed = roomRecords.filter((r) => r.total_duration != null).length;
    const stats = {
      uniqueStudents: new Set(roomRecords.map((r) => r.student_school_id).filter(Boolean)).size,
      totalMinutes,
      // Mean over COMPLETED sessions only. Including in-progress rows would
      // divide by a total_duration that is still growing, so a session that
      // started a minute ago would drag the average toward zero.
      avgMinutes: completed > 0 ? Math.round(totalMinutes / completed) : 0,
      activeNow: roomRecords.filter((r) => r.status === "active").length,
    };

    const total = roomRecords.length;
    // Clamped because both come straight off the query string. Unclamped,
    // ?page=-1 produced slice(-100, -50) -- an empty page reported alongside a
    // non-zero total, which reads as "the data is gone" rather than "the URL is
    // wrong". Upper bound keeps a hand-typed limit from allocating a huge slice.
    const pageNum = Math.min(Math.max(parseInt(page, 10) || 1, 1), 100000);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const start = (pageNum - 1) * limitNum;
    const paged = roomRecords.slice(start, start + limitNum);

    res.json({
      records: transformKeys(paged),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      roomName,
      years: uniqueYears,
      courses: uniqueCourses,
      sections: uniqueSections,
      subjects: uniqueSubjects,
      professors: uniqueProfessors,
      stats,
    });
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

    const allowed = ["subject", "professor", "lab_room", "room_code", "time_in", "time_out", "total_duration"];
    const sanitized = {};
    const fieldMap = {
      subject: "subject",
      professor: "professor",
      labRoom: "lab_room",
      roomCode: "room_code",
      timeIn: "time_in",
      timeOut: "time_out",
      totalDuration: "total_duration",
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
    const { from, to, course, year, section, subject, professor, labRoom, roomCode, roomId, student, date } = req.query;

    // A room-scoped page must never export the whole dataset, so resolve the room
    // server-side rather than trusting a client-supplied name. Only room_code is
    // carried forward: the room table filters on that field alone, and the export
    // has to return exactly the rows the table shows.
    const codeFilters = [roomCode].filter(Boolean);
    const nameFilters = [labRoom].filter(Boolean);
    if (roomId && codeFilters.length === 0 && nameFilters.length === 0) {
      const { data: roomRow } = await supabase
        .from("lab_rooms")
        .select("room_code,room_name")
        .eq("id", roomId)
        .maybeSingle();

      // Fail closed. Without this, a stale/deleted room id silently degrades to
      // "no room filter" and exports every room's attendance.
      if (!roomRow) return res.status(404).json({ error: "Room not found" });

      if (roomRow.room_code) codeFilters.push(roomRow.room_code);
      else nameFilters.push(roomRow.room_name);
    }
    const roomFilter = codeFilters[0] || nameFilters[0] || "";

    const fromDate = date || from;
    const toDateVal = date || to;

    let query = supabase.from("lab_attendance").select("*");
    if (fromDate) query = query.gte("date", fromDate);
    if (toDateVal) query = query.lte("date", toDateVal);

    const { data: records, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const result = sortAttendanceAsc(
      applyAssignedCourse(
        // The from/to bounds are already applied by the query above; only the
        // remaining column filters belong here.
        applyAttendanceFilters(records || [], { course, year, section, subject, professor, roomCode: codeFilters, labRoom: nameFilters, student, date }),
        req.adminAssignment
      )
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Lab Attendance");

    const headers = ["Date", "Student Name", "Student ID", "Course", "Section", "Year", "Subject", "Professor", "Lab Room", "Time-In", "Time-Out", "Total Duration", "Status"];
    const colWidths = [14, 24, 14, 10, 8, 8, 28, 22, 22, 14, 14, 16, 14];
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
    const filterDesc = describeAttendanceFilters({ ...req.query, roomCode: roomFilter || undefined });
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
      const status = r.status === "active" ? "Signed In" : "Signed Out";
      const duration = r.total_duration != null ? formatDuration(r.total_duration) : "-";
      sheet.addRow([
        r.date || "-",
        name,
        r.student_school_id || "-",
        r.course || "-",
        r.section || "-",
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
    const summaryRow = sheet.addRow(["", `Total Records: ${result.length}`, ...Array(headers.length - 2).fill("")]);
    summaryRow.font = { bold: true, size: 10 };

    const parts = [slug(course), slug(year), slug(section), slug(roomFilter)];
    const when = date || [from, to].filter(Boolean).join("_");
    if (when) parts.push(slug(when));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Attendance_${parts.filter(Boolean).join("_") || "report"}.xlsx`);
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

    // A name with no letters or digits ("!!!", "###") slugifies to "", and
    // normRoom("") === "" would then match every attendance row in the building
    // that has no room_code -- merging unrelated rooms into one history. Refuse
    // the room at creation rather than let it corrupt reads later.
    if (!roomCode) {
      return res.status(400).json({ error: "Room name must contain at least one letter or number" });
    }

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

    // With room_code frozen (see below), room_name is the only remaining signal
    // that tells two rooms apart. The kiosk derives room_code by slugifying the
    // name, so two rooms sharing a name would also share a code and have their
    // attendance merged. createRoom already refuses duplicates; a rename could
    // introduce one, so it has to be refused here too.
    if (sanitized.roomName !== undefined) {
      const wanted = String(sanitized.roomName).trim();
      if (!wanted) return res.status(400).json({ error: "Room name is required" });
      const { data: clash } = await supabase
        .from("lab_rooms")
        .select("id")
        .eq("room_name", wanted)
        .neq("id", id)
        .limit(1);
      if (clash && clash.length > 0) {
        return res.status(400).json({ error: "A room with this name already exists" });
      }
    }

    const updatePayload = {};
    if (sanitized.roomName !== undefined) {
      updatePayload.room_name = sanitized.roomName;
      // room_code and qr_data are deliberately NOT regenerated on rename.
      //
      // room_code is the join key lab_attendance rows were written with, and
      // the kiosk derives room_code by slugifying the name embedded in the QR
      // payload (AttendanceKioskPage.jsx:144) rather than looking lab_rooms up.
      // So regenerating either one is doubly destructive: the new key orphans
      // every prior row, AND newly scanned students get written under the new
      // key while the room still points at the old one — the room's attendance
      // splits permanently with no recovery path in the UI.
      //
      // Keeping qr_data frozen also keeps the printed and regenerated QR codes
      // encoding the ORIGINAL name, which is what makes future scans continue to
      // produce the frozen slug. The trade-off is that the QR modal shows the
      // original name after a rename; the alternative is changing the kiosk
      // contract to send the name only and resolving the code server-side.
      //
      // qr_data is deliberately absent from updatePayload -- writing the current
      // value back would be a no-op write that hides the intent.
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
      if (activeSession.room_code && !roomCode) {
        return res.status(400).json({ error: "Room code is required for sign-out." });
      }

      if (roomCode && activeSession.room_code) {
        const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (norm(roomCode) !== norm(activeSession.room_code)) {
          return res.status(400).json({
            error: `Cannot sign out from a different room. Please sign out from ${activeSession.lab_room || "the correct room"}.`,
          });
        }
      }

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
      lab_room: await resolveLabRoom(roomCode, labRoom),
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
};
