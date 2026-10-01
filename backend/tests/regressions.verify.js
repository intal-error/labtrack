/**
 * Regression tests for the bugs found during review:
 *  - attendance date presets resolved to the previous day (UTC slice of a
 *    local-calendar boundary), intermittently in UTC+8
 *  - a room's own rows could vanish from its export when room_code and
 *    lab_room disagreed
 *
 * The clock is injected so these assertions do not depend on the time of day
 * the suite happens to run -- which is exactly how the original bug hid.
 */
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const path = require("path");
const fs = require("fs");

// --- Load the real calendarBounds logic out of the ES module -------------
// exportReport.js is ESM; transpile-free evaluation is done by rewriting the
// two imports to CommonJS so the real source (not a copy) is under test.
const srcPath = path.resolve(__dirname, "../../frontend/src/components/ui/exportReport.js");
let src = fs.readFileSync(srcPath, "utf8");
src = src
  .replace(/^import\s+\{[^}]*\}\s+from\s+"\.\/dateRange";?$/m, "")
  .replace(/^export\s+/gm, "")
  .concat("\nmodule.exports = { buildAttendanceQuery, calendarBounds, buildExportQuery, rangeToParams, DATE_RANGE_OPTIONS };\n");

const localDayKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const module_ = { exports: {} };
new Function("localDayKey", "module", "exports", src)(localDayKey, module_, module_.exports);
const { buildAttendanceQuery, calendarBounds, buildExportQuery } = module_.exports;

const { applyAttendanceFilters, matchesField, normRoom } = (() => {
  const p = require.resolve("../src/utils/attendanceFilters");
  return require(p);
})();

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

// Oct 2 2026 is a Friday. Cover every hour so a UTC-vs-local mix-up cannot slip
// through at any point in the day.
const HOURS = [0, 3, 6, 9, 11, 12, 15, 18, 20, 23];

console.log("--- attendance date presets (local calendar days) ---");

for (const hour of HOURS) {
  const today = new Date(2026, 9, 2, hour, 30, 0); // 2 Oct 2026, local

  check(`week bounds @ ${String(hour).padStart(2, "0")}:00`,
    calendarBounds("week", today),
    { from: "2026-09-26", to: "2026-10-02" });

  check(`month bounds @ ${String(hour).padStart(2, "0")}:00`,
    calendarBounds("month", today),
    { from: "2026-09-02", to: "2026-10-02" });

  check(`today bounds @ ${String(hour).padStart(2, "0")}:00`,
    calendarBounds("today", today),
    { from: "2026-10-02", to: "2026-10-02" });
}

console.log("--- buildAttendanceQuery ---");

check("custom range passes the picked days through untouched",
  (() => {
    const q = buildAttendanceQuery({ dateRange: "custom", dateFrom: "2026-01-15", dateTo: "2026-03-20" });
    return { from: q.from, to: q.to };
  })(),
  { from: "2026-01-15", to: "2026-03-20" });

check("all time sends no date bounds",
  Object.keys(buildAttendanceQuery({ dateRange: "all", course: "BIT" })).sort(),
  ["course"]);

check("section/course/year are included, 'All' is omitted",
  (() => {
    const q = buildAttendanceQuery({ dateRange: "all", course: "BIT", year: "All", section: "A" });
    return { course: q.course, year: q.year, section: q.section };
  })(),
  { course: "BIT", section: "A" });

check("roomId is forwarded for server-side scoping",
  buildAttendanceQuery({ dateRange: "all", roomId: "room-cet" }).roomId,
  "room-cet");

console.log("--- transactions query builder still uses instants ---");

check("transactions 'week' still emits an ISO instant (not a sliced day)",
  /^20\d\d-\d\d-\d\dT/.test(buildExportQuery({ tab: "borrowed", dateRange: "week" }).dateFrom),
  true);

check("transactions custom range keeps full timestamps untouched",
  buildExportQuery({ tab: "borrowed", dateRange: "custom", dateFrom: "2026-01-15", dateTo: "2026-03-20" }),
  { tab: "borrowed", dateFrom: "2026-01-15", dateTo: "2026-03-20" });

console.log("--- month preset does not overflow on short months ---");

// Every month-length edge that used to overflow: new Date(y, m-1, 31) rolls
// forward (Oct 31 -> Oct 1), which silently truncated "This Month".
const EDGES = [
  ["2026-01-31", "2025-12-31"], // Dec has 31 days: valid
  ["2026-03-29", "2026-02-28"], // Feb 2026 has 28
  ["2026-03-30", "2026-02-28"],
  ["2026-03-31", "2026-02-28"],
  ["2026-05-31", "2026-04-30"], // Apr has 30
  ["2026-07-31", "2026-06-30"],
  ["2026-10-31", "2026-09-30"],
  ["2026-12-31", "2026-11-30"],
  ["2024-03-31", "2024-02-29"], // leap year Feb 29
];

for (const [todayStr, wantFrom] of EDGES) {
  const [y, m, d] = todayStr.split("-").map(Number);
  const today = new Date(y, m - 1, d, 8, 15, 0);
  check(`month from ${todayStr}`, calendarBounds("month", today).from, wantFrom);
  check(`month to ${todayStr}`, calendarBounds("month", today).to, todayStr);
}

console.log("--- transactions month preset is clamped too ---");

{
  const RealDate = Date;
  const originalNow = RealDate.now;
  // Pin "now" to Oct 31 so the old setMonth(-1) overflow would fire.
  const pinned = new RealDate(2026, 9, 31, 12, 0, 0);
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(pinned);
      return new RealDate(...args);
    }
    static now() { return pinned.getTime(); }
  };
  try {
    const q = buildExportQuery({ tab: "borrowed", dateRange: "month" });
    const from = localDayKey(new RealDate(q.dateFrom));
    check("transactions month from is 2026-09-30 (not 2026-10-01)", from, "2026-09-30");
  } finally {
    global.Date = RealDate;
    void originalNow;
  }
}

console.log("--- room matching: exact, then normalized, never substring ---");

check("exact code match", matchesField("CET-01", "CET-01"), true);
check("normalized code match (CET-01 vs 'cet 01')", matchesField("cet 01", "CET-01"), true);
check("name match", matchesField("CET CENTER", "CET CENTER"), true);
check("CET-01 must NOT swallow CET-010", matchesField("CET-010", "CET-01"), false);
check("LAB 1 must NOT swallow LAB 10", matchesField("LAB 10", "LAB 1"), false);
check("CET-01 must NOT match CET CENTER", matchesField("CET CENTER", "CET-01"), false);
check("empty record value never matches", matchesField("", "CET-01"), false);
check("empty filter never matches", matchesField("CET-01", ""), false);

console.log("--- room scoping mirrors the room table (room_code only) ---");

const rows = [
  { id: "code+name", room_code: "CET-01", lab_room: "CET CENTER", date: "2026-10-01" },
  { id: "name only", room_code: "", lab_room: "CET CENTER", date: "2026-10-01" },
  { id: "code only", room_code: "CET-01", lab_room: "", date: "2026-10-01" },
  { id: "other room", room_code: "NET-02", lab_room: "NET LAB", date: "2026-10-01" },
  // The discriminating case: the code string was typed into the name field, so a
  // cross-field match would pull a NET-02 row into CET-01's report.
  { id: "name holds the code", room_code: "NET-02", lab_room: "CET-01", date: "2026-10-01" },
];

// getRoomAttendanceHistory filters on norm(r.room_code) alone, so a row with no
// room_code is absent from the table. The export must agree exactly -- a row in
// the spreadsheet that the page never listed is the bug this guards.
const tableIds = rows
  .filter((r) => normRoom(r.room_code) === normRoom("CET-01"))
  .map((r) => r.id)
  .sort();

check("table-equivalent row set (room_code based)",
  tableIds,
  ["code only", "code+name"]);

const scoped = applyAttendanceFilters(rows, { roomCode: ["CET-01"] }).map((r) => r.id);

check("export row set matches the table row set exactly",
  scoped.slice().sort(),
  tableIds);

check("a row whose lab_room matches but has no room_code is excluded (parity)",
  scoped.includes("name only"), false);

check("other rooms are excluded", scoped.includes("other room"), false);

check("a row from another room whose lab_room holds this room's code is excluded",
  scoped.includes("name holds the code"), false);

check("a single code filter still works",
  applyAttendanceFilters(rows, { roomCode: "CET-01" }).map((r) => r.id).slice().sort(),
  ["code only", "code+name"]);

console.log("--- shared normRoom parity between table and export ---");

check("norm collapses punctuation runs to one dash", normRoom("CET-01"), "cet-01");
check("norm tolerates underscores", normRoom("CET_01"), "cet-01");
check("norm tolerates spaces", normRoom("cet 01"), "cet-01");
check("norm strips edge dashes", normRoom("-cet-01-"), "cet-01");
check("norm lowercases", normRoom("CET-01"), normRoom("cet-01"));
check("distinct codes stay distinct", normRoom("CET-01") === normRoom("CET-010"), false);
check("distinct names stay distinct", normRoom("LAB 1") === normRoom("LAB 10"), false);

console.log("--- disabled button is styled, not just inert ---");

{
  const css = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/styles/global.css"),
    "utf8"
  );
  check("global.css has a .btn-primary:disabled rule",
    /\.btn-primary:disabled\s*\{[^}]*\}/.test(css), true);
  check("the disabled rule conveys a not-allowed cursor",
    /\.btn-primary:disabled\s*\{[^}]*not-allowed/.test(css), true);
}

console.log("--- date bounds are calendar-day safe ---");

const dated = [
  { id: "d1", date: "2026-09-01" },
  { id: "d2", date: "2026-09-30" },
  { id: "d3", date: "2026-10-02" },
];

check("bare from includes the boundary day itself",
  applyAttendanceFilters(dated, { from: "2026-09-01" }).map((r) => r.id),
  ["d1", "d2", "d3"]);

check("bare to includes the boundary day itself",
  applyAttendanceFilters(dated, { to: "2026-09-30" }).map((r) => r.id),
  ["d1", "d2"]);

check("an ISO timestamp bound no longer drops its own boundary day",
  applyAttendanceFilters(dated, { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" }).map((r) => r.id),
  ["d1", "d2"]);

console.log("");
if (failures > 0) {
  console.log(`${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("ALL REGRESSION TESTS PASSED");
