const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { parseLocalDay } = require("../utils/exportUtils");
const { orEq, orEqAny } = require("../utils/postgrest");

const { transformKeys } = require("../utils/transformKeys");
const ExcelJS = require("exceljs");

const SENSITIVE_KEYS = new Set(["password", "passwordHash", "token", "accessToken", "refreshToken", "secret"]);

function sanitizeUser(u) {
  if (!u) return null;
  const out = {};
  for (const [k, v] of Object.entries(u)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function targetCourse(target) {
  if (!target) return "";
  if (target.courseId) return String(target.courseId).trim();
  if (target.assignedCourse) return String(target.assignedCourse).trim();
  if (Array.isArray(target.assignedCourses) && target.assignedCourses.length) return String(target.assignedCourses[0]).trim();
  if (target.course) return String(target.course).trim();
  return "";
}

function isAllowed(req, target) {
  if (req.isSuperAdmin) return true;
  if (!target) return false;
  if (target.id && target.id === req.user?.uid) return true;
  const codes = Array.isArray(req.scopeCodes) ? req.scopeCodes : [];
  const tc = targetCourse(target);
  if (target.role === "admin") {
    return Boolean(tc) && codes.includes(tc);
  }
  if (target.course) {
    return codes.includes(String(target.course).trim());
  }
  return false;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadTarget(id) {
  const userDoc = await db.collection("users").doc(id).get();
  if (userDoc.exists) return { id: userDoc.id, ...userDoc.data() };
  const adminDoc = await db.collection("admins").doc(id).get();
  if (adminDoc.exists) return { id: adminDoc.id, ...adminDoc.data(), role: adminDoc.data().role || "admin" };
  return null;
}

async function getPersona(req, res) {
  try {
    const target = await loadTarget(req.params.id);
    if (!target) return res.status(404).json({ error: "Person not found" });
    if (!isAllowed(req, target)) return res.status(403).json({ error: "Access denied" });

    const courseCode = targetCourse(target) || (target.course ? String(target.course).trim() : "");
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const status = req.query.status;

    // Course
    let course = null;
    if (courseCode) {
      const { data } = await supabase.from("courses").select("*").eq("id", courseCode).maybeSingle();
      course = data || null;
    }

    // Rooms
    let rooms = [];
    if (courseCode) {
      const { data } = await supabase.from("lab_rooms").select("*").eq("course", courseCode);
      rooms = data || [];
    }

    // Students (only meaningful for admin/faculty targets)
    let students = [];
    if (target.role === "admin" && courseCode) {
      const snap = await db.collection("users").where("role", "==", "student").where("course", "==", courseCode).get();
      students = snap.docs.map((d) => {
        const u = d.data();
        return {
          id: d.id,
          firstName: u.firstName || "",
          lastName: u.lastName || "",
          schoolId: u.schoolId || u.schoolID || u.employeeId || u.studentID || "",
          course: u.course || "",
          year: u.year || "",
          section: u.section || "",
          email: u.email || "",
          contact: u.contact || "",
          status: u.status || "active",
        };
      });
    }

    // Transactions
    let transactions = [];
    if (target.role === "admin" && courseCode) {
      const { data } = await supabase.from("transactions").select("*")
        .or(orEqAny(["course", "equipment_course"], courseCode));
      transactions = data || [];
    } else {
      const { data } = await supabase.from("transactions").select("*").eq("user_id", target.id);
      transactions = data || [];
    }
    // date/status filters
    const fromMs = dateFrom ? (parseLocalDay(dateFrom)?.getTime() ?? null) : null;
    const toMs = dateTo ? (parseLocalDay(dateTo, true)?.getTime() ?? null) : null;
    transactions = transactions.filter((t) => {
      if (status && status !== "All" && String(t.status || "").toLowerCase() !== String(status).toLowerCase()) return false;
      if (fromMs !== null) {
        const d = new Date(t.timestamp || t.borrowed_at || t.created_at);
        if (Number.isNaN(d.getTime()) || d.getTime() < fromMs) return false;
      }
      if (toMs !== null) {
        const d = new Date(t.timestamp || t.borrowed_at || t.created_at);
        if (Number.isNaN(d.getTime()) || d.getTime() > toMs) return false;
      }
      return true;
    });

    const now = Date.now();
    const overdue = transactions.filter((t) => {
      if (t.action !== "borrowed") return false;
      if (String(t.status || "").toLowerCase() === "returned") return false;
      const due = new Date(t.due_date);
      return !Number.isNaN(due.getTime()) && due.getTime() < now;
    });

    // Incidents
    let incidents = [];
    if (courseCode || target.id) {
      let q = supabase.from("incidents").select("*");
      const clauses = [];
      if (courseCode) clauses.push(orEq("reporter_course", courseCode));
      clauses.push(orEq("assigned_to", target.id));
      if (clauses.length) q = q.or(clauses.join(","));
      const { data } = await q;
      incidents = (data || []).filter((r) => {
        if (status && status !== "All" && String(r.status || "").toLowerCase() !== String(status).toLowerCase()) return false;
        return true;
      });
    }

    // Fines: fetch all, keep those whose transaction is in our transaction set or user is in students
    const txIds = new Set(transactions.map((t) => t.id));
    const studentIds = new Set(students.map((s) => s.id));
    if (target.role !== "admin") studentIds.add(target.id);
    const { data: allFines } = await supabase.from("fines").select("*");
    const fines = (allFines || []).filter((f) => txIds.has(f.transaction_id) || studentIds.has(f.user_id));

    // Attendance
    let attendance = [];
    if (courseCode) {
      const { data } = await supabase.from("lab_attendance").select("*").eq("course", courseCode);
      attendance = data || [];
    }
    // date filter for attendance
    attendance = attendance.filter((a) => {
      if (dateFrom && a.date && a.date < String(dateFrom).slice(0, 10)) return false;
      if (dateTo && a.date && a.date > String(dateTo).slice(0, 10)) return false;
      return true;
    });

    const lostDamaged = incidents.filter((i) => ["damage", "lost"].includes(String(i.type || "").toLowerCase()));

    res.json({
      user: sanitizeUser(target),
      course,
      rooms: transformKeys(rooms),
      students,
      transactions: transformKeys(transactions),
      overdue: transformKeys(overdue),
      lostDamaged: transformKeys(lostDamaged),
      incidents: transformKeys(incidents),
      fines: transformKeys(fines),
      attendance: transformKeys(attendance),
      counts: {
        students: students.length,
        transactions: transactions.length,
        overdue: overdue.length,
        lostDamaged: lostDamaged.length,
        incidents: incidents.length,
        fines: fines.length,
        attendance: attendance.length,
        rooms: rooms.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

async function buildPersonaWorkbook(req, target, type) {
  const courseCode = targetCourse(target) || (target.course ? String(target.course).trim() : "");
  const dateFrom = req.query.dateFrom;
  const dateTo = req.query.dateTo;
  const status = req.query.status;

  const workbook = new ExcelJS.Workbook();

  // Faculty Information
  if (type === "all" || type === "students") {
    const sheet = workbook.addWorksheet("Faculty Information");
    sheet.columns = [{ header: "Field", width: 24 }, { header: "Value", width: 60 }];
    const rows = [
      ["Name", `${target.firstName || ""} ${target.lastName || ""}`.trim()],
      ["Email", target.email || ""],
      ["Contact", target.contact || target.contactNumber || ""],
      ["Role", target.role || "admin"],
      ["Position", target.position || ""],
      ["Assigned Course", courseCode],
      ["Status", target.status || "active"],
    ];
    rows.forEach((r) => sheet.addRow(r));
  }

  let students = [];
  if (courseCode && (type === "all" || type === "students")) {
    const snap = await db.collection("users").where("role", "==", "student").where("course", "==", courseCode).get();
    students = snap.docs.map((d) => {
      const u = d.data();
      return {
        id: d.id,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        schoolId: u.schoolId || u.schoolID || u.employeeId || u.studentID || "",
        course: u.course || "",
        year: u.year || "",
        section: u.section || "",
        email: u.email || "",
        contact: u.contact || "",
        status: u.status || "active",
      };
    });
  }

  if (type === "all" || type === "students") {
    const sheet = workbook.addWorksheet("Students");
    const headers = ["Name", "School ID", "Course", "Year", "Section", "Email", "Contact", "Status"];
    const widths = [24, 16, 10, 11, 12, 28, 16, 10];
    sheet.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
    students.forEach((s) => {
      sheet.addRow([`${s.firstName} ${s.lastName}`.trim(), s.schoolId, s.course, s.year, s.section, s.email, s.contact, s.status]);
    });
  }

  // Rooms
  let rooms = [];
  if (courseCode) {
    const { data } = await supabase.from("lab_rooms").select("*").eq("course", courseCode);
    rooms = data || [];
  }
  if (type === "all") {
    const sheet = workbook.addWorksheet("Laboratory Rooms");
    const headers = ["Room Code", "Room Name", "Course", "Status"];
    const widths = [16, 30, 10, 12];
    sheet.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
    rooms.forEach((r) => sheet.addRow([r.room_code || r.roomCode || "", r.room_name || r.roomName || "", r.course || "", r.status || ""]));
  }

  // Transactions
  let transactions = [];
  if (target.role === "admin" && courseCode) {
    const { data } = await supabase.from("transactions").select("*")
      .or(orEqAny(["course", "equipment_course"], courseCode));
    transactions = data || [];
  } else {
    const { data } = await supabase.from("transactions").select("*").eq("user_id", target.id);
    transactions = data || [];
  }
  const fromMs = dateFrom ? (parseLocalDay(dateFrom)?.getTime() ?? null) : null;
  const toMs = dateTo ? (parseLocalDay(dateTo, true)?.getTime() ?? null) : null;
  transactions = transactions.filter((t) => {
    if (status && status !== "All" && String(t.status || "").toLowerCase() !== String(status).toLowerCase()) return false;
    if (fromMs !== null) {
      const d = new Date(t.timestamp || t.borrowed_at || t.created_at);
      if (Number.isNaN(d.getTime()) || d.getTime() < fromMs) return false;
    }
    if (toMs !== null) {
      const d = new Date(t.timestamp || t.borrowed_at || t.created_at);
      if (Number.isNaN(d.getTime()) || d.getTime() > toMs) return false;
    }
    return true;
  });

  if (type === "all" || type === "transactions") {
    const sheet = workbook.addWorksheet("Borrowing and Returns");
    const headers = ["Name", "School ID", "Course", "Year", "Equipment Course", "Item", "Qty", "Borrowed Date", "Due Date", "Returned Date", "Status"];
    const widths = [24, 14, 10, 11, 18, 30, 8, 20, 14, 20, 12];
    sheet.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
    transactions.forEach((t) => {
      const name = `${t.first_name || ""} ${t.last_name || ""}`.trim() || "-";
      sheet.addRow([
        name,
        t.school_id || "-",
        t.course || "-",
        t.year || "-",
        t.equipment_course || "-",
        t.item_name || "-",
        t.quantity || 0,
        formatDateTime(t.borrowed_at || t.timestamp),
        formatDate(t.due_date),
        formatDateTime(t.returned_at),
        t.status || "-",
      ]);
    });

    const now = Date.now();
    const overdueRows = transactions.filter((t) => {
      if (t.action !== "borrowed") return false;
      if (String(t.status || "").toLowerCase() === "returned") return false;
      const due = new Date(t.due_date);
      return !Number.isNaN(due.getTime()) && due.getTime() < now;
    });
    const overdueSheet = workbook.addWorksheet("Overdue Items");
    const oHeaders = ["Name", "School ID", "Item", "Qty", "Borrowed Date", "Due Date", "Days Overdue"];
    const oWidths = [24, 14, 30, 8, 20, 14, 12];
    overdueSheet.columns = oHeaders.map((h, i) => ({ header: h, width: oWidths[i] }));
    overdueRows.forEach((t) => {
      const name = `${t.first_name || ""} ${t.last_name || ""}`.trim() || "-";
      const due = new Date(t.due_date);
      const days = Math.ceil((now - due.getTime()) / (24 * 60 * 60 * 1000));
      overdueSheet.addRow([name, t.school_id || "-", t.item_name || "-", t.quantity || 0, formatDateTime(t.borrowed_at || t.timestamp), formatDate(t.due_date), days]);
    });

  }

  // Incidents
  let incidents = [];
  if (courseCode || target.id) {
    let q = supabase.from("incidents").select("*");
    const clauses = [];
    if (courseCode) clauses.push(orEq("reporter_course", courseCode));
    clauses.push(orEq("assigned_to", target.id));
    if (clauses.length) q = q.or(clauses.join(","));
    const { data } = await q;
    incidents = data || [];
  }
  const lostDamagedIncidents = incidents.filter((i) => ["damage", "lost"].includes(String(i.type || "").toLowerCase()));

  if (type === "all" || type === "transactions") {
    const sheet = workbook.addWorksheet("Lost and Damaged Items");
    const headers = ["Report ID", "Type", "Item", "Reporter", "School ID", "Status", "Incident Date", "Description"];
    const widths = [20, 14, 24, 20, 14, 12, 14, 40];
    sheet.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
    lostDamagedIncidents.forEach((i) => {
      sheet.addRow([
        i.id || "",
        i.type || "",
        i.item_name || i.itemName || "",
        i.reporter_name || "",
        i.reporter_school_id || "",
        i.status || "",
        formatDate(i.incident_date || i.created_at),
        i.description || "",
      ]);
    });

    const incSheet = workbook.addWorksheet("Incident Reports");
    const iHeaders = ["Report ID", "Type", "Severity", "Item", "Reporter", "School ID", "Assigned To", "Status", "Incident Date"];
    const iWidths = [20, 14, 10, 24, 20, 14, 20, 12, 14];
    incSheet.columns = iHeaders.map((h, i) => ({ header: h, width: iWidths[i] }));
    incidents.forEach((i) => {
      incSheet.addRow([
        i.id || "",
        i.type || "",
        i.severity || "",
        i.item_name || i.itemName || "",
        i.reporter_name || "",
        i.reporter_school_id || "",
        i.assigned_to_name || i.assigned_to || "",
        i.status || "",
        formatDate(i.incident_date || i.created_at),
      ]);
    });
  }

  // Fines (included in transactions type as summary-ish; put in Summary only to avoid extra sheet? Spec lists not separate, okay)
  // Attendance
  let attendance = [];
  if (courseCode && (type === "all" || type === "attendance")) {
    const { data } = await supabase.from("lab_attendance").select("*").eq("course", courseCode);
    attendance = (data || []).filter((a) => {
      if (dateFrom && a.date && a.date < String(dateFrom).slice(0, 10)) return false;
      if (dateTo && a.date && a.date > String(dateTo).slice(0, 10)) return false;
      return true;
    });
  }

  if (type === "all" || type === "attendance") {
    const sheet = workbook.addWorksheet("Laboratory Attendance");
    const headers = ["Date", "Student", "School ID", "Course", "Year", "Section", "Room", "Time In", "Time Out", "Duration (min)", "Status"];
    const widths = [12, 22, 14, 10, 11, 12, 16, 18, 18, 12, 10];
    sheet.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
    attendance.forEach((a) => {
      sheet.addRow([
        a.date || "",
        a.student_name || a.studentName || "",
        a.student_school_id || a.studentSchoolId || "",
        a.course || "",
        a.year || "",
        a.section || "",
        a.room_name || a.roomName || a.room_code || "",
        formatDateTime(a.time_in || a.timeIn),
        formatDateTime(a.time_out || a.timeOut),
        a.total_duration || a.totalDuration || 0,
        a.status || "",
      ]);
    });
  }

  // Summary
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ header: "Metric", width: 36 }, { header: "Value", width: 16 }];
  const summaryRows = [
    ["Faculty", `${target.firstName || ""} ${target.lastName || ""}`.trim()],
    ["Assigned Course", courseCode],
    ["Rooms", rooms.length],
    ["Students", students.length],
    ["Transactions", transactions.length],
    ["Overdue Items", transactions.filter((t) => t.action === "borrowed" && String(t.status || "").toLowerCase() !== "returned" && !Number.isNaN(new Date(t.due_date).getTime()) && new Date(t.due_date).getTime() < Date.now()).length],
    ["Lost/Damaged Incidents", lostDamagedIncidents.length],
    ["Incident Reports", incidents.length],
    ["Attendance Records", attendance.length],
  ];
  // fines count
  const txIds = new Set(transactions.map((t) => t.id));
  const studentIds = new Set(students.map((s) => s.id));
  if (target.role !== "admin") studentIds.add(target.id);
  const { data: allFines } = await supabase.from("fines").select("*");
  const finesCount = (allFines || []).filter((f) => txIds.has(f.transaction_id) || studentIds.has(f.user_id)).length;
  summaryRows.push(["Fines", finesCount]);
  summaryRows.forEach((r) => summary.addRow(r));

  return workbook;
}

async function downloadPersonaReport(req, res) {
  try {
    const target = await loadTarget(req.params.id);
    if (!target) return res.status(404).json({ error: "Person not found" });
    if (!isAllowed(req, target)) return res.status(403).json({ error: "Access denied" });

    const type = (req.query.type || "all").toLowerCase();
    const allowedTypes = new Set(["all", "students", "transactions", "attendance"]);
    if (!allowedTypes.has(type)) return res.status(400).json({ error: "Invalid type" });

    const workbook = await buildPersonaWorkbook(req, target, type);

    const name = `${target.firstName || ""} ${target.lastName || ""}`.trim() || target.id;
    const slugName = name.replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Persona_${slugName}_${type}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

module.exports = { getPersona, downloadPersonaReport };
