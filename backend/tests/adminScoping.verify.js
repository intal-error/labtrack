// Verifies admin scoping: applyAssignedCourse, and that every attendance reader
// actually calls it.
//
// WHY THIS FILE EXISTS: courseFilter populates BOTH assignedCourse and
// assignedYear, and its own docstring says "Admins only see data matching their
// assignedCourse + assignedYear" -- but applyAssignedCourse read assignedCourse
// and ignored assignedYear entirely. An admin with a year assigned was never
// year-scoped, anywhere, silently.
//
// A second gap lived alongside it: getRoomAttendanceHistory was the one reader
// that never called applyAssignedCourse at all, so a course-scoped admin saw
// other courses' students on the room page while its own export (which does
// scope) returned fewer rows than the screen above it.
//
// Both are asserted here against the real helper and the real controller.
//
// Run: node tests/adminScoping.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

const rooms = [
  { id: "room-cet", room_code: "cet-center", room_name: "CET CENTER" },
  { id: "room-net", room_code: "net-lab", room_name: "NET LAB" },
];

const rec = (o) => ({
  student_school_id: "23-000039", course: "BIT", year: "4th Year", section: "4B",
  subject: "Net 1", professor: "Dela Cruz", room_code: "cet-center",
  date: "2026-09-30", total_duration: 2, status: "timed_out", ...o,
});

const records = [
  rec({ id: "b1", course: "BIT", year: "4th Year" }),
  rec({ id: "b2", course: "BIT", year: "3rd Year" }),
  rec({ id: "b3", course: "BSCS", year: "4th Year" }),
  rec({ id: "b4", course: "BSCS", year: "3rd Year" }),
  rec({ id: "b5", course: "BIT", year: "4th Year", room_code: "net-lab" }),
];

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        const source = table === "lab_rooms" ? rooms : records;
        let rows = [...source];
let key = null; let value = null;
        const chain = {
          select: () => chain,
          eq: (k, v) => {
            key = k;
            value = v;
            rows = rows.filter((r) => String(r[key]) === String(value));
            return chain;
          },
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
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: {},
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const { applyAssignedCourse } = require("../src/utils/attendanceFilters");
const { getRoomAttendanceHistory } = require("../src/controllers/attendanceController");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}
const ids = (rows) => rows.map((r) => r.id).sort();

(async () => {
  console.log("--- no assignment means no restriction ---");
  check("undefined assignment", ids(applyAssignedCourse(records, undefined)), ["b1", "b2", "b3", "b4", "b5"]);
  check("empty assignment", ids(applyAssignedCourse(records, { assignedCourse: "", assignedYear: "" })), ["b1", "b2", "b3", "b4", "b5"]);
  check("null records are safe", applyAssignedCourse(undefined, { assignedCourse: "BIT" }), []);

  console.log("--- course scoping (the half that always worked) ---");
  check("course only", ids(applyAssignedCourse(records, { assignedCourse: "BIT" })), ["b1", "b2", "b5"]);
  check("course is case-insensitive", ids(applyAssignedCourse(records, { assignedCourse: "bit" })), ["b1", "b2", "b5"]);

  console.log("--- year scoping (previously a silent no-op) ---");
  check("year only", ids(applyAssignedCourse(records, { assignedYear: "3rd Year" })), ["b2", "b4"]);
  check("year is case-insensitive", ids(applyAssignedCourse(records, { assignedYear: "3rd year" })), ["b2", "b4"]);

  console.log("--- the admin editor's year field is free text, so '4' must match '4th Year' ---");
  // validate.js caps assignedYear at 10 chars of arbitrary text, so an admin can
  // plausibly have stored "4". Comparing as a plain string would scope them to
  // zero rows, which reads as "the data is gone".
  check("bare digit matches the ordinal form", ids(applyAssignedCourse(records, { assignedYear: "4" })), ["b1", "b3", "b5"]);
  check("ordinal form matches the bare digit", ids(applyAssignedCourse(records, { assignedYear: "4th Year" })), ["b1", "b3", "b5"]);
  check("a digit does not match a different ordinal", ids(applyAssignedCourse(records, { assignedYear: "5" })), []);

  console.log("--- the two dimensions combine ---");
  check("course + year", ids(applyAssignedCourse(records, { assignedCourse: "BIT", assignedYear: "4th Year" })), ["b1", "b5"]);
  check("course + conflicting year yields nothing", ids(applyAssignedCourse(records, { assignedCourse: "BSCS", assignedYear: "4th Year" })), ["b3"]);
  check("year alone does not imply course", ids(applyAssignedCourse(records, { assignedYear: "4th Year" })), ["b1", "b3", "b5"]);

  console.log("--- non-matching values must not fall open ---");
  check("unknown course yields nothing", ids(applyAssignedCourse(records, { assignedCourse: "NOPE" })), []);
  check("unknown year yields nothing", ids(applyAssignedCourse(records, { assignedYear: "Ninth Year" })), []);
  // Guards against a year filter matching a record whose year is blank.
  check("blank record year is excluded when a year is set",
    ids(applyAssignedCourse([rec({ id: "blank", year: "" })], { assignedYear: "4th Year" })), []);
  check("and is kept when no year is set",
    ids(applyAssignedCourse([rec({ id: "blank", year: "" })], { assignedCourse: "BIT" })), ["blank"]);

  console.log("--- every attendance reader scopes, including the room history page ---");
  const call = async (query, assignment) => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    await getRoomAttendanceHistory({ params: { roomId: "room-cet" }, query, adminAssignment: assignment }, res);
    return res.body;
  };
  check("room page, no assignment", (await call({}, undefined)).total, 4);
  check("room page, course scoped", (await call({}, { assignedCourse: "BIT" })).total, 2);
  // room-cet holds four rows: BIT/3rd, BIT/4th, BSCS/3rd, BSCS/4th. So "3rd Year"
  // leaves two, not one -- b5 is net-lab and already out of scope.
  check("room page, year scoped", (await call({}, { assignedYear: "3rd Year" })).total, 2);
  check("room page, course + year scoped", (await call({}, { assignedCourse: "BIT", assignedYear: "4th Year" })).total, 1);

  console.log("--- a course-scoped admin's facets match what they may query ---");
  // If these leaked, the dropdown would offer a course that returns nothing --
  // the same class of dead control as the export bug.
  const scoped = await call({}, { assignedCourse: "BSCS", assignedYear: "" });
  check("courses facet is scoped", scoped.courses, ["BSCS"]);
  check("years facet is scoped", scoped.years, ["3rd Year", "4th Year"]);
  const yearScoped = await call({}, { assignedCourse: "", assignedYear: "3rd Year" });
  check("courses facet follows a year scope", yearScoped.courses, ["BIT", "BSCS"]);
  check("years facet is year-scoped", yearScoped.years, ["3rd Year"]);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
