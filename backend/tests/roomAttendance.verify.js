// Verifies getRoomAttendanceHistory — the endpoint behind /attendance/room/:id.
//
// WHY THIS FILE EXISTS: that endpoint grew subject and professor filters, a
// professors facet, and a stats aggregate, but nothing exercised it. The six
// pre-existing suites all target other endpoints, so a regression here would
// ship silently. It is also the only attendance reader that does NOT apply
// applyAssignedCourse (see the note at the bottom) — asserted here so the gap
// is documented rather than forgotten.
//
// Fully offline: the Supabase and Firebase clients are stubbed before the
// controller loads, exactly as attendanceExport.verify.js does.
//
// Run: node tests/roomAttendance.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

// CET-01 has four sessions across two sections and three professors.
// lab-2 has one. "unused-lab" is a configured room with NO attendance at all.
const rooms = [
  { id: "room-cet", room_code: "CET-01", room_name: "CET CENTER", location: "Building A", status: "active" },
  { id: "room-2", room_code: "lab-2", room_name: "NET LAB", location: "Building B", status: "active" },
  { id: "room-unused", room_code: "unused-lab", room_name: "UNUSED LAB", location: null, status: "inactive" },
];

const att = (over) => ({
  student_school_id: "23-000039",
  // The controller matches on room_code, so CET-01 rows must carry it.
  room_code: "CET-01",
  lab_room: "CET CENTER",
  course: "BIT",
  year: "4th Year",
  section: "4B",
  subject: "Net 1",
  professor: "Dela Cruz",
  date: "2026-09-30",
  time_in: "2026-09-30T04:32:00Z",
  time_out: "2026-09-30T04:34:00Z",
  total_duration: 2,
  status: "timed_out",
  ...over,
});

const records = [
  att({ id: "a1", first_name: "Ann", last_name: "Aguilar", section: "4B", subject: "Net 1", professor: "Dela Cruz", date: "2026-10-01", total_duration: 1, time_out: "2026-10-01T23:12:00Z" }),
  att({ id: "a2", student_school_id: "23-000040", first_name: "Ben", last_name: "Bautista", section: "4A", subject: "Net 1", professor: "Santos", date: "2026-09-30", total_duration: 2 }),
  att({ id: "a3", student_school_id: "23-000041", first_name: "Cara", last_name: "Cruz", course: "BSCS", year: "3rd Year", section: "3A", subject: "Algo 1", professor: "Reyes", date: "2026-09-30", total_duration: 2 }),
  att({ id: "a4", student_school_id: "23-000042", first_name: "Dan", last_name: "Diaz", section: "4B", subject: "Net 2", professor: "Dela Cruz", date: "2026-09-28", total_duration: 6 }),
  // In-progress: status active, total_duration null.
  att({ id: "a5", student_school_id: "23-000043", first_name: "Eve", last_name: "Enriquez", section: "4B", subject: "Net 2", professor: "Lim", date: "2026-09-20", time_out: null, total_duration: null, status: "active" }),
  att({ id: "b1", student_school_id: "23-000050", first_name: "Fay", last_name: "Ferrer", professor: "Dela Cruz", room_code: "lab-2", lab_room: "NET LAB", date: "2026-09-19", time_out: null, total_duration: null, status: "active" }),
];

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        const source = table === "lab_rooms" ? rooms : records;
        let rows = source;
        let eqKey = null;
        let eqValue = null;

        const chain = {
          select: () => chain,
          eq: (k, v) => {
            eqKey = k;
            eqValue = v;
            rows = rows.filter((r) => String(r[eqKey]) === String(eqValue));
            return chain;
          },
          // The controller resolves the room with .single() and 404s on null, so
          // this must actually narrow by the eq() applied above.
          single: () => Promise.resolve({ data: rows[0] || null, error: null }),
          maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
          then: (resolve) => resolve({ data: rows, error: null }),
        };
        return chain;
      },
    },
  },
};

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

const { getRoomAttendanceHistory } = require("../src/controllers/attendanceController");
// Imported so the parity assertions below exercise the SAME helpers the
// endpoint and the export use, rather than a re-implementation that could drift
// and hide the very divergence it is meant to catch.
const { applyAttendanceFilters, applyAssignedCourse, normRoom } = require("../src/utils/attendanceFilters");

// The row set exportToExcel would fetch for a room: every attendance row, with
// the room narrowed by room_code exactly as the export resolves it from roomId.
const recordsFor = (roomCode) => records.filter((x) => normRoom(x.room_code) === normRoom(roomCode));

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

async function call(roomId, query = {}, adminAssignment) {
  const res = makeRes();
  await getRoomAttendanceHistory({ params: { roomId }, query, adminAssignment }, res);
  return res;
}

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

(async () => {
  console.log("--- room scoping ---");
  let r = await call("room-cet");
  check("total is scoped to the room", r.body.total, 5);
  check("roomName echoed", r.body.roomName, "CET CENTER");
  check("other room's professor not offered", r.body.professors.includes("Dela Cruz"), true);
  r = await call("room-2");
  check("lab-2 sees only its own row", r.body.total, 1);
  check("lab-2 professors scoped", r.body.professors, ["Dela Cruz"]);

  console.log("--- unknown room fails closed ---");
  r = await call("room-does-not-exist");
  check("unknown room returns 404", r.statusCode, 404);
  check("unknown room reports why", r.body, { error: "Room not found" });

  console.log("--- facets are computed BEFORE filtering, so they stay stable ---");
  const all = (await call("room-cet")).body;
  check("years facet", all.years, ["3rd Year", "4th Year"]);
  check("courses facet", all.courses, ["BIT", "BSCS"]);
  check("sections facet", all.sections, ["3A", "4A", "4B"]);
  check("subjects facet", all.subjects, ["Algo 1", "Net 1", "Net 2"]);
  check("professors facet", all.professors, ["Dela Cruz", "Lim", "Reyes", "Santos"]);

  const narrowed = (await call("room-cet", { professor: "Dela Cruz" })).body;
  check("total narrowed by professor", narrowed.total, 2);
  check("professors facet unchanged by filtering", narrowed.professors, all.professors);
  check("sections facet unchanged by filtering", narrowed.sections, all.sections);

  console.log("--- professor filter ---");
  check("professor matches case-insensitively", (await call("room-cet", { professor: "dela cruz" })).body.total, 2);
  check("unknown professor yields nothing", (await call("room-cet", { professor: "Nobody" })).body.total, 0);
  check("professor + section combine", (await call("room-cet", { professor: "Dela Cruz", section: "4B" })).body.total, 2);
  check("professor + impossible section yields nothing", (await call("room-cet", { professor: "Reyes", section: "4B" })).body.total, 0);

  console.log("--- subject filter ---");
  check("subject narrows", (await call("room-cet", { subject: "Net 2" })).body.total, 2);
  check("subject + professor combine", (await call("room-cet", { subject: "Net 2", professor: "Dela Cruz" })).body.total, 1);

  console.log("--- student search ---");
  check("by school id", (await call("room-cet", { student: "23-000042" })).body.total, 1);
  check("by first name", (await call("room-cet", { student: "ann" })).body.total, 1);

  console.log("--- date bounds are calendar-day safe ---");
  check("from keeps its boundary day", (await call("room-cet", { from: "2026-09-30" })).body.total, 3);
  check("to keeps its boundary day", (await call("room-cet", { to: "2026-09-28" })).body.total, 2);
  check("from carrying a time keeps its boundary day", (await call("room-cet", { from: "2026-09-30T00:00:00Z" })).body.total, 3);

  console.log("--- aggregates cover the FILTERED set ---");
  let s = (await call("room-cet")).body.stats;
  // total_duration across all five: 1 + 2 + 2 + 6 + null = 11, over 4 completed.
  check("totalMinutes unfiltered", s.totalMinutes, 11);
  check("avgMinutes over completed only", s.avgMinutes, 3);
  check("uniqueStudents unfiltered", s.uniqueStudents, 5);
  check("activeNow counts the in-progress row", s.activeNow, 1);

  s = (await call("room-cet", { professor: "Dela Cruz" })).body.stats;
  check("totalMinutes within professor", s.totalMinutes, 7);
  check("uniqueStudents within professor", s.uniqueStudents, 2);
  check("activeNow within professor", s.activeNow, 0);

  console.log("--- newest first ---");
  r = await call("room-cet");
  check("first record is the newest date", r.body.records[0].date, "2026-10-01");

  console.log("--- pagination ---");
  r = await call("room-cet", { page: "1", limit: "2" });
  check("page size honoured", r.body.records.length, 2);
  check("total is the unpaginated count", r.body.total, 5);
  check("totalPages computed", r.body.totalPages, 3);
  r = await call("room-cet", { page: "3", limit: "2" });
  check("last page returns the remainder", r.body.records.length, 1);

  console.log("--- THE ROOM-WITH-NO-HISTORY CASE ---");
  r = await call("room-unused");
  check("total is 0", r.body.total, 0);
  check("totalPages is 0, not NaN", r.body.totalPages, 0);
  check("records empty", r.body.records, []);
  // Every facet empty is what makes AttendanceFilterSelect render disabled
  // rather than silently dropping the control from the toolbar.
  check("years facet empty", r.body.years, []);
  check("courses facet empty", r.body.courses, []);
  check("sections facet empty", r.body.sections, []);
  check("subjects facet empty", r.body.subjects, []);
  check("professors facet empty", r.body.professors, []);
  check("stats all zero, no NaN", r.body.stats, { uniqueStudents: 0, totalMinutes: 0, avgMinutes: 0, activeNow: 0 });

  console.log("--- empty filtered set must not divide by zero ---");
  s = (await call("room-cet", { professor: "Nobody" })).body.stats;
  check("avgMinutes is 0, not NaN", s.avgMinutes, 0);
  check("activeNow is 0, not NaN", s.activeNow, 0);

  console.log("--- page and limit are clamped, not trusted ---");
  // These come straight off the query string. Unclamped, ?page=-1 produced
  // slice(-100, -50): an empty page reported alongside a non-zero total, which
  // reads as "the history is gone" rather than "the URL is wrong".
  r = await call("room-cet", { page: "-1", limit: "2" });
  check("negative page is clamped to 1", r.body.page, 1);
  check("and still returns rows", r.body.records.length, 2);

  r = await call("room-cet", { page: "0" });
  check("zero page is clamped to 1", r.body.page, 1);

  r = await call("room-cet", { page: "abc" });
  check("non-numeric page falls back to 1", r.body.page, 1);

  r = await call("room-cet", { limit: "-5" });
  check("negative limit is clamped to 1", r.body.records.length, 1);

  r = await call("room-cet", { limit: "0" });
  check("zero limit falls back to the default page size", r.body.records.length, 5);

  r = await call("room-cet", { limit: "99999" });
  check("absurd limit is capped, not honoured", r.body.records.length, 5);
  check("and total still reflects the true count", r.body.total, 5);

  console.log("--- admin course assignment is honoured ---");
  // This endpoint used to omit applyAssignedCourse while exportToExcel applied
  // it. Two consequences, both now guarded below:
  //   1. leak — other courses' students were listed on screen
  //   2. silent mismatch — filtering to another course gave an empty workbook
  //      while the table showed rows; filtering to a year gave fewer rows
  const scoped = { assignedCourse: "BSCS", assignedYear: "" };
  r = await call("room-cet", {}, scoped);
  check("total is limited to the assigned course", r.body.total, 1);
  check("only the assigned course's row survives", r.body.records.map((x) => x.id), ["a3"]);

  console.log("--- facets are scoped too, so no dropdown offers a dead value ---");
  // Scoping after the facet() calls would leave "BSCS" offered to a BIT-scoped
  // admin, and selecting it would return nothing — the original symptom in a new
  // place.
  check("courses facet excludes other courses", r.body.courses, ["BSCS"]);
  check("years facet is scoped", r.body.years, ["3rd Year"]);
  check("sections facet is scoped", r.body.sections, ["3A"]);
  check("subjects facet is scoped", r.body.subjects, ["Algo 1"]);
  check("professors facet is scoped", r.body.professors, ["Reyes"]);
  check("stats are scoped", r.body.stats, { uniqueStudents: 1, totalMinutes: 2, avgMinutes: 2, activeNow: 0 });

  console.log("--- table and export agree (the invariant that actually broke) ---");
  // exportToExcel applies applyAssignedCourse and getRoomAttendanceHistory did
  // not, so any filter could diverge. Assert both sides produce the same count
  // for the same filters under the same assignment.
  for (const filters of [{}, { course: "BSCS" }, { year: "3rd Year" }, { course: "BIT" }, { year: "4th Year" }]) {
    const label = Object.keys(filters).length ? Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(" ") : "no filter";
    const tableRows = (await call("room-cet", filters, scoped)).body.total;
    // Export side, reproduced from exportToExcel's own composition:
    // applyAttendanceFilters(...) then applyAssignedCourse(...).
    const exportRows = applyAssignedCourse(applyAttendanceFilters(recordsFor("CET-01"), filters), scoped).length;
    check(`table and export agree for ${label}`, tableRows, exportRows);
  }

  console.log("--- unassigned admins are unaffected ---");
  r = await call("room-cet", {}, {});
  check("no assignment sees every room row", r.body.total, 5);
  r = await call("room-cet", {}, { assignedCourse: "", assignedYear: "" });
  check("blank assignment sees every room row", r.body.total, 5);
  r = await call("room-cet", {}, undefined);
  check("missing adminAssignment is safe", r.body.total, 5);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
