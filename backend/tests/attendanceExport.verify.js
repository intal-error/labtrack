process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// Stub the supabase client before the controller loads so we exercise the real
// ExcelJS generation path without touching the network.
const supabasePath = require.resolve("../src/config/supabase");

const rooms = [{ id: "room-cet", room_code: "CET-01", room_name: "CET CENTER" }];

const records = [
  { id: "a1", first_name: "Marc", last_name: "Lawrence", student_school_id: "23-000039", course: "BIT", year: "4th Year", section: "A", subject: "Test", professor: "Mar", lab_room: "CET CENTER", room_code: "CET-01", date: "2026-09-30", time_in: "2026-09-30T04:32:00Z", time_out: "2026-09-30T04:34:00Z", total_duration: 2, status: "timed_out" },
  { id: "a2", first_name: "Marc", last_name: "Lawrence", student_school_id: "23-000039", course: "BIT", year: "4th Year", section: "B", subject: "Draw", professor: "Drew", lab_room: "CET CENTER", room_code: "CET-01", date: "2026-09-28", time_in: "2026-09-28T09:15:00Z", time_out: "2026-09-28T09:22:00Z", total_duration: 6, status: "timed_out" },
  { id: "a3", first_name: "Ana", last_name: "Reyes", student_school_id: "24-000112", course: "CT", year: "3rd Year", section: "A", subject: "Test", professor: "Mar", lab_room: "NET LAB", room_code: "NET-02", date: "2026-09-30", time_in: "2026-09-30T01:00:00Z", time_out: "2026-09-30T01:30:00Z", total_duration: 30, status: "timed_out" },
  { id: "a4", first_name: "Jude", last_name: "Santos", student_school_id: "25-000777", course: "BIT", year: "1st Year", section: "", subject: "Test", professor: "Mar", lab_room: "CET CENTER", room_code: "CET-01", date: "2026-09-29", time_in: "2026-09-29T07:00:00Z", time_out: "2026-09-29T08:00:00Z", total_duration: 60, status: "timed_out" },
  { id: "a5", first_name: "Kim", last_name: "Diaz", student_school_id: "26-000555", course: "BIT", year: "4th Year", section: "A", subject: "Test", professor: "Jhon", lab_room: "CET CENTER", room_code: "CET-01", date: "2026-08-15", time_in: "2026-08-15T07:00:00Z", time_out: "2026-08-15T08:00:00Z", total_duration: 60, status: "timed_out" },
];

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      // Models the real client closely enough that gte/lte/eq actually narrow
      // the result set, otherwise the tests would pass only because the
      // controller redundantly re-filtered what PostgREST already filtered.
      from: (table) => {
        let rows = table === "lab_attendance" ? records : rooms;
        let rowKey = null;
        let opValue = null;
        let op = null;

        const applyOps = () => {
          if (!rowKey) return;
          if (op === "gte") rows = rows.filter((r) => r[rowKey] >= opValue);
          else if (op === "lte") rows = rows.filter((r) => r[rowKey] <= opValue);
          else if (op === "eq") rows = rows.filter((r) => r[rowKey] === opValue);
        };

        const chain = {
          select: () => chain,
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
          gte: (k, v) => { op = "gte"; rowKey = k; opValue = v; applyOps(); return chain; },
          lte: (k, v) => { op = "lte"; rowKey = k; opValue = v; applyOps(); return chain; },
          eq: (k, v) => { op = "eq"; rowKey = k; opValue = v; applyOps(); return chain; },
          then: (resolve) => resolve({ data: rows, error: null }),
        };
        return chain;
      },
    },
  },
};

const ExcelJS = require("exceljs");

// The attendance controller also pulls in firebase-admin, which exits the
// process without credentials. Stub it out -- the export path never uses it.
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    admin: {},
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const { exportToExcel } = require("../src/controllers/attendanceController");
const { applyAttendanceFilters } = require("../src/utils/attendanceFilters");

function makeRes() {
  const chunks = [];
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
    write(chunk) { chunks.push(chunk); return true; },
    end() { this.ended = true; },
    async buffer() { return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))); },
  };
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

async function exportAndRead(query) {
  const res = makeRes();
  await exportToExcel({ query }, res);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.buffer());
  return { res, sheet: wb.getWorksheet(1) };
}

(async () => {
  console.log("--- applyAttendanceFilters ---");

  check("no filters returns everything",
    applyAttendanceFilters(records, {}).map((r) => r.id),
    ["a1", "a2", "a3", "a4", "a5"]);

  check("course filter",
    applyAttendanceFilters(records, { course: "BIT" }).map((r) => r.id).sort(),
    ["a1", "a2", "a4", "a5"]);

  check("year filter",
    applyAttendanceFilters(records, { year: "4th Year" }).map((r) => r.id).sort(),
    ["a1", "a2", "a5"]);

  check("section filter (the new capability)",
    applyAttendanceFilters(records, { section: "A" }).map((r) => r.id).sort(),
    ["a1", "a3", "a5"]);

  check("section filter is case-insensitive",
    applyAttendanceFilters(records, { section: "b" }).map((r) => r.id),
    ["a2"]);

  check("course + year + section combined",
    applyAttendanceFilters(records, { course: "BIT", year: "4th Year", section: "A" }).map((r) => r.id).sort(),
    ["a1", "a5"]);

  check("blank section rows are excluded when a section is chosen",
    applyAttendanceFilters(records, { section: "A" }).includes(records[3]), false);

  // Subject and professor became reachable from the UI when the export dialog
  // gained those fields, so the server side needs asserting too.
  check("subject filter",
    applyAttendanceFilters(records, { subject: "Test" }).map((r) => r.id).sort(),
    ["a1", "a3", "a4", "a5"]);

  check("professor filter",
    applyAttendanceFilters(records, { professor: "Mar" }).map((r) => r.id).sort(),
    ["a1", "a3", "a4"]);

  check("professor filter is case-insensitive",
    applyAttendanceFilters(records, { professor: "mar" }).map((r) => r.id).sort(),
    ["a1", "a3", "a4"]);

  check("subject + professor combined",
    applyAttendanceFilters(records, { subject: "Test", professor: "Jhon" }).map((r) => r.id),
    ["a5"]);

  // THIS is the contract the frontend must honour: the backend treats these as
  // literal values with no sentinel awareness, so a dialog that forwards "All"
  // filters every row out. frontend/tests/exportReport.verify.js asserts the
  // frontend strips it before it gets here.
  check("the sentinel 'All' is matched literally, not ignored",
    applyAttendanceFilters(records, { subject: "All", professor: "All" }).map((r) => r.id),
    []);

  check("roomCode matches room_code only",
    applyAttendanceFilters(records, { roomCode: "CET-01" }).map((r) => r.id).slice().sort(),
    ["a1", "a2", "a4", "a5"]);

  check("labRoom matches lab_room only",
    applyAttendanceFilters(records, { labRoom: "CET CENTER" }).map((r) => r.id).slice().sort(),
    ["a1", "a2", "a4", "a5"]);

  check("room is scoped - other rooms excluded",
    applyAttendanceFilters(records, { roomCode: "CET-01" }).includes(records[2]), false);

  console.log("--- room scoping is field-explicit (table parity) ---");

  const inconsistent = [
    { id: "code match, name differs", room_code: "CET-01", lab_room: "SOMETHING ELSE" },
    { id: "name match, code differs", room_code: "NET-02", lab_room: "CET CENTER" },
    { id: "no code at all", room_code: "", lab_room: "CET CENTER" },
    { id: "both match", room_code: "CET-01", lab_room: "CET CENTER" },
  ];

  check("roomCode filter ignores lab_room entirely",
    applyAttendanceFilters(inconsistent, { roomCode: "CET-01" }).map((r) => r.id),
    ["code match, name differs", "both match"]);

  check("labRoom filter ignores room_code entirely",
    applyAttendanceFilters(inconsistent, { labRoom: "CET CENTER" }).map((r) => r.id),
    ["name match, code differs", "no code at all", "both match"]);

  check("an empty room filter list does NOT filter everything out",
    applyAttendanceFilters(inconsistent, { roomCode: [], labRoom: [] }).length,
    inconsistent.length);

  check("undefined room filters do not filter anything",
    applyAttendanceFilters(inconsistent, {}).length,
    inconsistent.length);

  check("from/to range",
    applyAttendanceFilters(records, { from: "2026-09-28", to: "2026-09-30" }).map((r) => r.id).sort(),
    ["a1", "a2", "a3", "a4"]);

  check("student search by school id",
    applyAttendanceFilters(records, { student: "23-000039" }).map((r) => r.id),
    ["a1", "a2"]);

  console.log("--- exportToExcel ---");

  const all = await exportAndRead({});
  check("filename falls back to Attendance_report", all.res.headers["Content-Disposition"], "attachment; filename=Attendance_report.xlsx");

  const cet = await exportAndRead({ roomId: "room-cet" });
  check("roomId resolves to a room filter (bug fix)", cet.res.headers["Content-Disposition"], "attachment; filename=Attendance_CET_01.xlsx");
  check("room-scoped export excludes other rooms",
    cet.sheet.getColumn(1).values.slice(4).filter(Boolean).length, 4);
  const cetRows = [];
  for (let r = 4; r <= cet.sheet.rowCount; r++) {
    const v = cet.sheet.getRow(r).getCell(9).value;
    if (v) cetRows.push(v);
  }
  check("every exported row is from CET CENTER", [...new Set(cetRows)], ["CET CENTER"]);

  const filtered = await exportAndRead({ roomId: "room-cet", course: "BIT", year: "4th Year", section: "A", from: "2026-09-01", to: "2026-09-30" });
  check("filename names every filter",
    filtered.res.headers["Content-Disposition"],
    "attachment; filename=Attendance_BIT_4th_Year_A_CET_01_2026_09_01_2026_09_30.xlsx");
  check("subtitle lists course, year, section, room and range",
    String(filtered.sheet.getCell("A2").value),
    "Course: BIT | Year: 4th Year | Section: A | Room: CET-01 | From: Sep 1, 2026 To: Sep 30, 2026 | Generated: " +
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));

  const exportedRows = [];
  for (let r = 4; r <= filtered.sheet.rowCount; r++) {
    const row = filtered.sheet.getRow(r);
    const year = row.getCell(6).value;
    if (!year) continue; // blank spacer + summary rows have no year
    exportedRows.push(`${row.getCell(2).value}|${row.getCell(5).value}|${year}`);
  }
  check("only BIT / 4th Year / A rows exported", exportedRows, ["Marc Lawrence|A|4th Year"]);

  check("summary row counts only filtered records",
    filtered.sheet.getRow(filtered.sheet.rowCount).getCell(2).value, "Total Records: 1");

  const today = await exportAndRead({ date: "2026-09-30" });
  const todayDesc = String(today.sheet.getCell("A2").value);
  check("date param still works and is described", todayDesc.includes("Date: 2026-09-30"), true);
  check("date param scopes to a single day",
    today.sheet.getRow(today.sheet.rowCount).getCell(2).value, "Total Records: 2");

  console.log("--- subject / professor narrow a real workbook ---");

  const bySubject = await exportAndRead({ subject: "Draw" });
  check("subject narrows the exported rows",
    bySubject.sheet.getRow(bySubject.sheet.rowCount).getCell(2).value, "Total Records: 1");
  check("subtitle describes the subject",
    String(bySubject.sheet.getCell("A2").value).includes("Subject: Draw"), true);

  const byProfessor = await exportAndRead({ professor: "Jhon" });
  check("professor narrows the exported rows",
    byProfessor.sheet.getRow(byProfessor.sheet.rowCount).getCell(2).value, "Total Records: 1");
  check("subtitle describes the professor",
    String(byProfessor.sheet.getCell("A2").value).includes("Professor: Jhon"), true);

  const byBoth = await exportAndRead({ subject: "Test", professor: "Jhon" });
  check("subject + professor combined",
    byBoth.sheet.getRow(byBoth.sheet.rowCount).getCell(2).value, "Total Records: 1");

  // The exact regression, server side: a workbook still builds, still returns
  // 200, and contains nothing. This is what a user saw as "Report downloaded!"
  console.log("--- the failure mode the frontend guard prevents ---");
  const sentinelLeak = await exportAndRead({ subject: "All", professor: "All" });
  check("sentinel leak produces a 200 with an empty workbook",
    sentinelLeak.res.statusCode, 200);
  check("sentinel leak exports zero records",
    sentinelLeak.sheet.getRow(sentinelLeak.sheet.rowCount).getCell(2).value, "Total Records: 0");

  console.log("--- unresolvable room must fail closed ---");

  // A stale/deleted room id must NOT degrade to "no room filter", which would
  // silently export every room's attendance.
  const missing = makeRes();
  await exportToExcel({ query: { roomId: "room-does-not-exist" } }, missing);
  check("unknown roomId returns 404", missing.statusCode, 404);
  check("unknown roomId returns an error body", missing.body?.error, "Room not found");
  check("unknown roomId writes no workbook", missing.ended, undefined);

  const unresolvable = makeRes();
  await exportToExcel({ query: { roomCode: "", labRoom: "", roomId: "" } }, unresolvable);
  check("empty room params is treated as unfiltered (no room scope requested)",
    unresolvable.statusCode, 200);

  console.log("");
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL ATTENDANCE EXPORT TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
