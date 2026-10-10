/**
 * Verifies how the laboratory logbook filters.
 *
 * WHY THIS FILE USED TO ASSERT SOMETHING ELSE: it pinned BUILDING-WIDE visibility
 * ("every admin sees every student in every room"), after attendance had previously
 * been scoped by each admin's assignedCourse in five places that had drifted apart.
 * That is no longer the contract, and leaving the assertions in place would have been
 * worse than deleting them: `invoke()` builds requests with no `profile`, so
 * scopeByRoom() was inert and the whole file passed identically whether or not room
 * scoping existed. A test that cannot fail is worse than no test.
 *
 * THE CONTRACT NOW:
 *   - attendance is scoped by ROOM OWNERSHIP (lab_rooms.course), not by the
 *     student's course. A Course Admin sees the logbook of the rooms their course
 *     owns, INCLUDING entries by students of every other course -- a room is
 *     shared through the day, and the logbook answers "who used this room, for what
 *     subject", which is a facility question rather than a course one.
 *   - a room owned by another course is invisible, as is a row whose room_code
 *     matches no room at all.
 *   - the reader's OWN ?course= filter still narrows on top of that, and stays
 *     case-insensitive. Scoping must not have quietly broken a control that works.
 *
 * Cross-surface scope resolution lives in tests/roomScope.verify.js. This file
 * covers the filtering behaviour those endpoints share, so the two overlap
 * deliberately and neither is vacuous.
 *
 * Run: node tests/attendanceVisibility.verify.js   (or: npm run verify -w backend)
 */

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// Required before the fixtures below, which are dated with it. schoolClock depends
// on neither Supabase nor Firestore, so stubbing those later cannot affect it -- and
// it resolves its timezone explicitly, so the host clock is irrelevant here.
const { todayKey } = require("../src/utils/schoolClock");

/**
 * Fixture rows are dated with the real school-time today, not a literal.
 *
 * getTodayAttendance and getStats filter on `date = today`, so a hardcoded date makes
 * them return nothing the day after the suite is written -- and makes the assertions
 * pass vacuously if the literal happens to equal the real today.
 */
const TODAY = todayKey();

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");
const { applyOr } = require("./helpers/orFilter");

// Ownership is set per room, because room ownership is now the boundary.
let rooms = [];
let records = [];

const rec = (o) => ({
  student_school_id: "23-000039", course: "BIT", year: "4th Year", section: "4B",
  subject: "Net 1", professor: "Dela Cruz", room_code: "cet-center",
  // lab_room is populated by resolveLabRoom at write time and is what the facets
  // prefer (`lab_room || room_code`). Leaving it blank made the rooms facet report
  // room CODES, which looks like a scoping bug and is not one.
  lab_room: "CET CENTER",
  date: TODAY, total_duration: 2, status: "active", ...o,
});

function resetFixtures() {
  rooms = [
    { id: "room-cet", room_code: "cet-center", room_name: "CET CENTER", course: "CT" },
    { id: "room-net", room_code: "net-lab", room_name: "NET LAB", course: "CT" },
    // Owned by MT: the row in it must be invisible to the CT admin.
    { id: "room-shop", room_code: "shop-floor", room_name: "SHOP FLOOR", course: "MT" },
  ];

  records = [
    rec({ id: "b1", course: "BIT", year: "4th Year", status: "active" }),
    rec({ id: "b2", course: "BIT", year: "3rd Year", status: "active" }),
    rec({ id: "b3", course: "CT", year: "4th Year", status: "active" }),
    rec({ id: "b4", course: "CT", year: "3rd Year", status: "active" }),
    // MT student, but in a CT-OWNED room. The single most important row here: it
    // must be visible to the CT admin, because scoping by the STUDENT's course
    // would hide it and that is the mistake this file exists to prevent.
    rec({ id: "b5", course: "MT", year: "4th Year", room_code: "net-lab", lab_room: "NET LAB", status: "active" }),
    // In an MT-owned room: invisible to the CT admin.
    rec({ id: "b6", course: "MT", year: "4th Year", room_code: "shop-floor", lab_room: "SHOP FLOOR", status: "active" }),
    // A student with NO course recorded. Must still appear in an owned room --
    // failing closed applies to the ADMIN's course, not to the student's.
    rec({ id: "b7", course: "", year: "1st Year", status: "active" }),
    // No room_code at all: belongs to no course, so no Course Admin sees it.
    rec({ id: "b8", room_code: "", status: "active" }),
  ];
}
resetFixtures();

// Minimal PostgREST query-builder stub.
//
// WHY THIS IS NOT JUST select/eq: the controllers push predicates into SQL rather
// than reading the whole table and filtering in JS, so the stub has to execute the
// predicates or the suite would pass without exercising any of it.
//
// Every method is a pure transformation of a local `working` array, so chains built
// in parallel (getStats fires four at once) cannot trample each other.
function makeChain(initial) {
  let working = [...initial];
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
    gte: (k, v) => { working = working.filter((r) => String(r[k]) >= String(v)); return chain; },
    lte: (k, v) => { working = working.filter((r) => String(r[k]) <= String(v)); return chain; },
    in: (k, list) => { working = working.filter((r) => list.map(String).includes(String(r[k]))); return chain; },
    not: (k, neg) => { working = working.filter((r) => (r[k] != null) !== neg); return chain; },
    or: (expr) => { working = applyOr(working, expr); return chain; },
    order: () => chain,
    limit: (n) => { working = working.slice(0, n); return chain; },
    range: (a, b) => { working = working.slice(a, b + 1); return chain; },
    maybeSingle: () => {
      const hit = working[0];
      return { then: (r) => r({ data: hit || null, error: hit ? null : { message: "no rows" } }) };
    },
    single: () => {
      const hit = working[0];
      return { then: (r) => r({ data: hit || null, error: hit ? null : { message: "no rows" } }) };
    },
    then: (resolve) => resolve({ data: headOnly ? null : working, error: null, count: working.length }),
  };
  return chain;
}

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: { supabase: { from: (t) => makeChain(t === "lab_rooms" ? rooms : records) } },
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
  getAttendanceFacets,
  getAttendanceHistory,
  getRoomAttendanceHistory,
  getStats,
} = require("../src/controllers/attendanceController");
const { invalidateRoomCourseCache } = require("../src/utils/roomScope");
const { applyAttendanceFilters } = require("../src/utils/attendanceFilters");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {},
  };
}

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail(e, a) ? "" : `\n        want ${e}\n        got  ${a}`}`);
}
function detail() { return true; }

const ids = (rows) => (rows || []).map((r) => r.id).sort();

// The three callers. Every request carries a profile, which is the whole point: the
// previous version of this file omitted it, which is why the scope was inert and the
// assertions could not fail.
const SUPER = { role: "admin", adminLevel: "super", courseId: null };
const CT = { role: "admin", adminLevel: "course", courseId: "CT" };
const MT = { role: "admin", adminLevel: "course", courseId: "MT" };

async function invoke(handler, req = {}) {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  await handler(
    { user: { uid: "u1" }, profile: CT, query: {}, params: {}, ...req },
    res
  );
  return res.body;
}

/** Fixtures reset AND the memoised room-code lists dropped, together. */
function reset() {
  resetFixtures();
  invalidateRoomCourseCache();
}

(async () => {
  console.log("--- the logbook is room-based, not student-course-based ---");
  reset();
  const today = await invoke(getTodayAttendance);
  check("CT admin sees both of their rooms", ids(today), ["b1", "b2", "b3", "b4", "b5", "b7"]);
  check("including an MT student who used a CT room", ids(today).includes("b5"), true);
  check("including a student with no course recorded", ids(today).includes("b7"), true);
  check("but not a row in another course's room", ids(today).includes("b6"), false);
  check("nor a row with no room at all", ids(today).includes("b8"), false);

  console.log("--- the boundary is room ownership, on every reader ---");
  reset();
  check("Currently Inside follows it too", ids(await invoke(getActiveStudents)), ["b1", "b2", "b3", "b4", "b5", "b7"]);
  reset();
  check("history follows it too", (await invoke(getAttendanceHistory)).total, 6);
  reset();
  const roomHistory = await invoke(getRoomAttendanceHistory, { params: { roomId: "room-cet" } });
  check("a room's own history is unaffected by who scans", roomHistory.total, 5);
  check("  and still includes other courses' students", roomHistory.courses, ["BIT", "CT"]);

  console.log("--- a different course sees its own rooms and no more ---");
  reset();
  check("MT admin sees only the MT room", ids(await invoke(getTodayAttendance, { profile: MT })), ["b6"]);
  reset();
  check("Super Admin sees everything", ids(await invoke(getTodayAttendance, { profile: SUPER })), ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);

  console.log("--- the reader's own ?course= filter still works ---");
  reset();
  check("course=CT narrows", ids(await invoke(getTodayAttendance, { query: { course: "CT" } })), ["b3", "b4"]);
  reset();
  check("course=BIT narrows", ids(await invoke(getTodayAttendance, { query: { course: "BIT" } })), ["b1", "b2"]);
  reset();
  check("and is case-insensitive, as before", ids(await invoke(getTodayAttendance, { query: { course: "bit" } })), ["b1", "b2"]);
  reset();
  check(
    "and intersects with the scope rather than replacing it",
    ids(await invoke(getTodayAttendance, { query: { course: "MT" } })),
    ["b5"],
    "the only MT-student row in a CT-owned room; b6 is out of scope and must not sneak in"
  );
  reset();
  check(
    "a course outside the scope yields nothing, not an error",
    await invoke(getTodayAttendance, { query: { course: "ZZZ" } }),
    []
  );

  console.log("--- facets offer every value present in the caller's rooms ---");
  reset();
  const facets = await invoke(getAttendanceFacets);
  check("courses facet spans the students seen, not just the owner's", facets.courses, ["BIT", "CT", "MT"]);
  check("rooms facet is the owned rooms", facets.rooms, ["CET CENTER", "NET LAB"]);
  reset();
  const mtFacets = await invoke(getAttendanceFacets, { profile: MT });
  check("and a different owner gets a different set", mtFacets.courses, ["MT"]);

  console.log("--- the KPI strip agrees with the list beneath it ---");
  reset();
  const stats = await invoke(getStats);
  const active = await invoke(getActiveStudents);
  check("the tile equals the list length", stats.currentlyInside, active.length);
  check("and it counts every course, not just the owner's students", stats.currentlyInside, 6);

  /*
   * The room page and the XLSX must show the same rows.
   *
   * This is the invariant that has actually broken here before: the room page
   * applied a filter and exportToExcel applied a separate copy, the copies drifted,
   * and an admin got an empty workbook beside a populated table. Both now carry a
   * scope, but by DIFFERENT implementations -- getRoomAttendanceHistory scopes with
   * an .or() over room_code variants plus roomInScope(), while exportToExcel uses
   * scopeByRoom() on the SQL builder. Two implementations of one rule is exactly the
   * setup that drifts, so the parity has to be asserted, not assumed.
   *
   * The export side is reproduced from applyAttendanceFilters over the rows for that
   * room, the same way roomAttendance.verify.js does it. That file's copy of this
   * assertion runs with NO profile, so its scope is inert and it cannot catch a
   * divergence between the two scoped implementations; this one can.
   */
  console.log("--- the room page and the export agree, under a live scope ---");
  const inRoom = (code) => records.filter((r) => r.room_code === code);
  for (const [roomId, code, label] of [["room-cet", "cet-center", "CET"], ["room-net", "net-lab", "NET"]]) {
    for (const filters of [{}, { course: "CT" }, { year: "3rd Year" }, { course: "BIT" }]) {
      const what = Object.keys(filters).length ? Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(" ") : "no filter";
      reset();
      const tableRows = (await invoke(getRoomAttendanceHistory, { params: { roomId }, query: filters })).total;
      const exportRows = applyAttendanceFilters(inRoom(code), filters).length;
      check(`${label} parity for ${what}`, tableRows, exportRows);
    }
  }

  console.log("--- a room in someone else's scope is a 404, not an empty page ---");
  reset();
  const foreign = mockRes();
  await getRoomAttendanceHistory(
    { user: { uid: "u1" }, profile: CT, params: { roomId: "room-shop" }, query: {} },
    foreign
  );
  check("the CT admin cannot open the MT room's history", foreign.statusCode, 404);
  check("and is told it does not exist, not that it is empty", foreign.body.error, "Room not found");

  console.log("");
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});