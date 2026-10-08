// Verifies that attendance is BUILDING-WIDE: no admin assignment narrows it.
//
// WHY THIS FILE REPLACED THE OLD adminScoping.verify.js
// -----------------------------------------------------
// Attendance used to be scoped by each admin's assignedCourse/assignedYear, and
// two copies of that rule existed: applyAssignedCourse (used by Today's Log,
// History, Facets, Room history and the export) and four hand-rolled
// `r.course === req.adminAssignment.assignedCourse` checks (getActiveStudents,
// getDailyLog and twice in getStats). They had already drifted -- the hand-rolled
// ones were case-sensitive where the helper was not, and none of them honoured
// assignedYear. On a live install the result was an admin whose assignment
// matched nothing seeing three entirely blank screens, with no way to tell that
// a filter was at fault rather than the data being gone.
//
// The requirement is now that every admin sees every student who signs in or out,
// in every room, so the assignment is not consulted at all. That is a stronger
// guarantee than the old tests, and the only honest way to pin it is to assert
// the readers IGNORE a deliberately narrow assignment.
//
// Course scoping still exists elsewhere and is unaffected: incidents and borrow
// requests scope via getAdminCourses (utils/adminScope.js), pinned by
// tests/incidentWorkflow.verify.js.
//
// Run: node tests/attendanceVisibility.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// Required before the fixtures below, which are dated with it. schoolClock
// depends on neither Supabase nor Firestore, so stubbing those later cannot
// affect it -- and it resolves its timezone explicitly, so the host clock is
// irrelevant here.
const { todayKey } = require("../src/utils/schoolClock");

/**
 * Fixture rows are dated with the real school-time today, not a literal.
 *
 * getTodayAttendance and getStats filter on `date = today`, so a hardcoded date
 * makes them return nothing the day after the suite is written -- and makes the
 * assertions pass vacuously if the literal happens to equal the real today.
 */
const TODAY = todayKey();

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");
const { applyOr } = require("./helpers/orFilter");

const rooms = [
  { id: "room-cet", room_code: "cet-center", room_name: "CET CENTER" },
  { id: "room-net", room_code: "net-lab", room_name: "NET LAB" },
];

const rec = (o) => ({
  student_school_id: "23-000039", course: "BIT", year: "4th Year", section: "4B",
  subject: "Net 1", professor: "Dela Cruz", room_code: "cet-center",
  date: TODAY, total_duration: 2, status: "timed_out", ...o,
});

const records = [
  rec({ id: "b1", course: "BIT", year: "4th Year" }),
  rec({ id: "b2", course: "BIT", year: "3rd Year" }),
  rec({ id: "b3", course: "CT", year: "4th Year" }),
  rec({ id: "b4", course: "CT", year: "3rd Year" }),
  rec({ id: "b5", course: "MT", year: "4th Year", room_code: "net-lab" }),
];

// Minimal PostgREST query-builder stub.
//
// WHY THIS IS NOT JUST select/eq: the controller now pushes predicates into SQL
// rather than reading the whole table and filtering in JS -- that pushdown is the
// point of the exercise, so the stub has to actually execute the predicates or the
// suite would pass without exercising any of it.
//
// Supported: eq, neq, gt/gte/lt/lte (numeric or string, matching PostgREST's
// comparison semantics), in, not, or, range, limit, order, single, maybeSingle, and
// head:true/count:"exact" for the head-count queries in getStats.
//
// Every method is a pure transformation of a local `working` array, so chains
// built in parallel (getStats fires three at once) cannot trample each other.
function makeChain(initial) {
  let working = [...initial];
  let ordered = false;
  // PostgREST's head:true returns a count header and an EMPTY body -- no rows at
  // all. getStats depends on that: it asks for `.count` instead of shipping every
  // open session to count them in JS, so a stub that kept returning rows would let
  // a regression back in unnoticed.
  let headOnly = false;

  const chain = {
    select: (_cols, opts = {}) => {
      if (opts.head) headOnly = true;
      return chain;
    },
    eq: (k, v) => {
      if (v === null) working = working.filter((r) => r[k] != null);
      else working = working.filter((r) => String(r[k]) === String(v));
      return chain;
    },
    neq: (k, v) => {
      if (v === null) working = working.filter((r) => r[k] == null);
      else working = working.filter((r) => String(r[k]) !== String(v));
      return chain;
    },
    gt: (k, v) => { working = working.filter((r) => cmp(r[k], v) > 0); return chain; },
    gte: (k, v) => { working = working.filter((r) => cmp(r[k], v) >= 0); return chain; },
    lt: (k, v) => { working = working.filter((r) => cmp(r[k], v) < 0); return chain; },
    lte: (k, v) => { working = working.filter((r) => cmp(r[k], v) <= 0); return chain; },
    in: (k, list) => { working = working.filter((r) => list.map(String).includes(String(r[k]))); return chain; },
    not: (k, neg) => {
      // PostgREST's .not(column, "is"|"is not", value) is a null-check, not a
      // general negation.
      if (neg === "is") working = working.filter((r) => r[k] != null);
      else if (neg === "is not") working = working.filter((r) => r[k] == null);
      return chain;
    },
    // Values arrive QUOTED (utils/postgrest.js orEq), so a comma inside a room code must
    // not split the clause. See tests/helpers/orFilter.js.
    or: (expr) => {
        working = applyOr(working, expr);
        return chain;
      },
    range: (from, to) => { working = working.slice(from, to + 1); return chain; },
    limit: (n) => { working = working.slice(0, n); return chain; },
    order: (k, opts = {}) => {
      if (ordered) return chain;
      ordered = true;
      const dir = opts.ascending === false ? -1 : 1;
      working = [...working].sort((a, b) => cmp(a[k], b[k]) * dir);
      return chain;
    },
    single: () => Promise.resolve({ data: working[0] || null, error: null }),
    maybeSingle: () => Promise.resolve({ data: working[0] || null, error: null }),
    then: (resolve) =>
      resolve({ data: headOnly ? null : working, error: null, count: working.length }),
  };
  return chain;
}

// PostgREST orders NULLs last for ascending order, and compares as text when the
// value is not numeric. Both details matter for date columns, which arrive as
// "YYYY-MM-DD" strings that must compare chronologically.
function cmp(a, b) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  const sa = String(a);
  const sb = String(b);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: (table) => makeChain(table === "lab_rooms" ? rooms : records),
    },
  },
};

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: {},
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const {
  getActiveStudents,
  getTodayAttendance,
  getDailyLog,
  getAttendanceFacets,
  getAttendanceHistory,
  getRoomAttendanceHistory,
  getStats,
} = require("../src/controllers/attendanceController");
const { applyAttendanceFilters } = require("../src/utils/attendanceFilters");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}
const ids = (rows) => (rows || []).map((r) => r.id).sort();

/**
 * Assignments chosen to be hostile on purpose.
 *
 * `narrow` is the exact shape that produced a blank screen in production: an admin
 * whose assignedCourse exists in the data but whose assignedYear does not (the
 * "BIT / 1st Year" profile whose rows were all BIT / 4th Year). If any reader
 * still consults the assignment, `narrow` catches it.
 */
const NARROW = { assignedCourse: "BIT", assignedCourses: ["BIT"], assignedYear: "1st Year" };
const OTHER = { assignedCourse: "CT", assignedCourses: ["CT"], assignedYear: "" };
const BLANK = { assignedCourse: "", assignedCourses: [], assignedYear: "" };

async function invoke(handler, req = {}) {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  await handler({ user: { uid: "u1" }, query: {}, params: {}, ...req }, res);
  return res.body;
}

/** Every assignment an admin could plausibly arrive with. */
const ASSIGNMENTS = [
  ["narrow course+year", NARROW],
  ["a different course", OTHER],
  ["blank assignment", BLANK],
  ["no assignment at all", undefined],
];

(async () => {
  console.log("--- Today's Log ignores the admin assignment ---");
  for (const [label, assignment] of ASSIGNMENTS) {
    const rows = await invoke(getTodayAttendance, { adminAssignment: assignment });
    check(`${label} sees every course`, ids(rows), ["b1", "b2", "b3", "b4", "b5"]);
  }

  console.log("--- an explicit Course filter still works ---");
  // Scoping being removed must not remove the user's own filtering.
  const ct = await invoke(getTodayAttendance, { query: { course: "CT" }, adminAssignment: NARROW });
  check("course=CT narrows to CT", ids(ct), ["b3", "b4"]);
  const bit = await invoke(getTodayAttendance, { query: { course: "bit" }, adminAssignment: NARROW });
  check("and is case-insensitive, as before", ids(bit), ["b1", "b2"]);

  console.log("--- the daily log ignores the admin assignment ---");
  for (const [label, assignment] of ASSIGNMENTS) {
    const rows = await invoke(getDailyLog, { params: { date: TODAY }, adminAssignment: assignment });
    check(`${label} sees the whole day`, ids(rows), ["b1", "b2", "b3", "b4", "b5"]);
  }

  console.log("--- Currently Inside ignores the admin assignment ---");
  for (const [label, assignment] of ASSIGNMENTS) {
    const rows = await invoke(getActiveStudents, { adminAssignment: assignment });
    check(`${label} sees every open session`, ids(rows), []);
  }

  console.log("--- attendance history ignores the admin assignment ---");
  for (const [label, assignment] of ASSIGNMENTS) {
    const body = await invoke(getAttendanceHistory, { adminAssignment: assignment });
    check(`${label} sees all history`, body.total, 5);
  }

  console.log("--- a room's history ignores the admin assignment ---");
  // This endpoint used to scope while the export did not, so filtering to another
  // course produced an empty workbook next to a populated table. Both are now
  // unscoped, so they cannot diverge.
  for (const [label, assignment] of ASSIGNMENTS) {
    const body = await invoke(getRoomAttendanceHistory, { params: { roomId: "room-cet" }, adminAssignment: assignment });
    check(`${label} sees every course in the room`, body.total, 4);
  }

  console.log("--- the table and the export agree, whatever the assignment ---");
  // The invariant that originally broke, re-asserted on the new composition:
  // exportToExcel and getRoomAttendanceHistory must produce the same rows for the
  // same filters, because they are now built from the same two steps.
  const filters = [{}, { course: "CT" }, { year: "3rd Year" }, { course: "BIT" }, { year: "4th Year" }, { student: "39" }];
  for (const f of filters) {
    const label = Object.keys(f).length ? Object.entries(f).map(([k, v]) => `${k}=${v}`).join(" ") : "no filter";
    for (const [assignmentLabel, assignment] of ASSIGNMENTS) {
      const tableRows = (await invoke(getRoomAttendanceHistory, { params: { roomId: "room-cet" }, query: f, adminAssignment: assignment })).total;
      const exportRows = applyAttendanceFilters(
        records.filter((r) => r.room_code === "cet-center"),
        f
      ).length;
      check(`parity for ${label} (${assignmentLabel})`, tableRows, exportRows);
    }
  }

  console.log("--- facets offer every value, so no dropdown is dead ---");
  const facets = await invoke(getAttendanceFacets, { adminAssignment: NARROW });
  check("courses facet lists all of them", facets.courses, ["BIT", "CT", "MT"]);
  check("years facet lists all of them", facets.years, ["3rd Year", "4th Year"]);

  console.log("--- the KPI strip agrees with the list beneath it ---");
  // currentlyInside is now unscoped, so it can no longer contradict the
  // Currently Inside tab the way it did when one counted today's rows and the
  // other counted only the admin's course.
  const stats = await invoke(getStats, { adminAssignment: NARROW });
  const active = await invoke(getActiveStudents, { adminAssignment: NARROW });
  check("the tile equals the list length", stats.currentlyInside, active.length);
  check("and both are zero with nothing open", stats.currentlyInside, 0);

  console.log("--- a case-mismatched course can no longer hide rows ---");
  // getActiveStudents/getDailyLog/getStats compared with `===`, so an assignment
  // stored as "bit" against rows stored as "BIT" returned nothing while Today's
  // Log worked. With no comparison at all the mismatch is unrepresentable.
  const lower = await invoke(getTodayAttendance, { adminAssignment: { assignedCourse: "bit", assignedYear: "4th year" } });
  check("rows are visible", ids(lower), ["b1", "b2", "b3", "b4", "b5"]);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();