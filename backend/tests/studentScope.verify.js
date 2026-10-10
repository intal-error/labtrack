/**
 * Verifies course scoping on the student roster (GET /api/users).
 *
 * WHY A NEW FILE: students are the one dataset that lives in FIRESTORE, not
 * Supabase, so this exercises a different stub surface entirely -- a query chain
 * with .count() aggregations and a 30-value `in` cap that Supabase does not have.
 *
 * Two things this pins that are easy to get wrong:
 *
 *   1. ?course= is a SUPER ADMIN filter. A Course Admin sending ?course=OTHER must
 *      not get that course's roster. Ignoring the parameter (rather than honouring
 *      it) is deliberate: honouring it would either leak or return an empty list
 *      that reads as a bug.
 *   2. An admin assigned NO course gets an empty roster, not every student. That
 *      is the fail-closed default, and it is the case a naive implementation turns
 *      into a school-wide leak by simply omitting the `course` filter.
 *
 * Run: node backend/tests/studentScope.verify.js
 */

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const firebasePath = require.resolve("../src/config/firebase");
const supabasePath = require.resolve("../src/config/supabase");

const FIRESTORE_IN_LIMIT = 30;

/** Records the firings of Firestore query APIs, so scope is asserted on the QUERY. */
const fired = { in: [], counts: [] };

function studentQuery(students) {
  let rows = students.filter((s) => s.role === "student");
  const conds = [];

  const chain = {
    where(field, op, value) {
      conds.push([field, op, value]);
      if (op === "==") rows = rows.filter((r) => r[field] === value);
      if (op === "in") {
        if (value.length > FIRESTORE_IN_LIMIT) {
          throw new Error(`Firestore \`in\` accepts at most ${FIRESTORE_IN_LIMIT} values, got ${value.length}`);
        }
        rows = rows.filter((r) => value.includes(r[field]));
      }
      return chain;
    },
    count() {
      fired.counts.push(conds.map((c) => `${c[0]}${c[1]}${JSON.stringify(c[2])}`).join("&"));
      return {
        get: async () => {
          fired.in.push(conds.filter((c) => c[1] === "in").flatMap((c) => c[2]));
          return { data: () => ({ count: rows.length }) };
        },
      };
    },
    async get() {
      fired.in.push(conds.filter((c) => c[1] === "in").flatMap((c) => c[2]));
      return { docs: rows.map((r) => ({ id: r.id, data: () => ({ ...r }) })) };
    },
  };
  return chain;
}

const STUDENTS = [
  { id: "s1", firstName: "Ana", lastName: "Dela Cruz", role: "student", course: "BIT", year: "4th Year", section: "4A", schoolId: "23-1" },
  { id: "s2", firstName: "Ben", lastName: "Reyes", role: "student", course: "BIT", year: "3rd Year", section: "3B", schoolId: "23-2" },
  { id: "s3", firstName: "Cara", lastName: "Lim", role: "student", course: "CT", year: "2nd Year", section: "2A", schoolId: "23-3" },
  { id: "s4", firstName: "Dan", lastName: "Ocho", role: "student", course: "MT", year: "1st Year", section: "1A", schoolId: "23-4" },
  { id: "s5", firstName: "Eve", lastName: "Santos", role: "student", course: "", year: "1st Year", section: "1B", schoolId: "23-5" },
  // Not a student: must never appear in a roster.
  { id: "a1", firstName: "Root", lastName: "Admin", role: "admin", course: "CT" },
];

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    db: { collection: () => studentQuery(STUDENTS) },
    auth: {},
  },
};

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: () => {
        const chain = {
          select: () => chain,
          in: () => chain,
          then: (resolve) => resolve({ data: [], error: null }),
        };
        return chain;
      },
    },
  },
};

const { listStudents } = require("../src/controllers/userController");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function mockRes() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
}

async function call(req) {
  fired.in = [];
  fired.counts = [];
  const res = mockRes();
  await listStudents({ query: {}, params: {}, ...req }, res);
  return { ...res, ids: ((res.payload && res.payload.data) || res.payload || []).map((r) => r.id) };
}

const SUPER = { profile: { role: "admin", adminLevel: "super", courseId: null } };
const BIT = { profile: { role: "admin", adminLevel: "course", courseId: "BIT" } };
const NONE = { profile: { role: "admin", adminLevel: "course", courseId: "ZZZ" } };
const LEGACY_MULTI = { profile: { role: "admin", assignedCourses: ["BIT", "CT"] } };

(async () => {
  console.log("--- a Course Admin sees only their course ---");
  const bit = await call({ ...BIT, query: { page: "1", limit: "10" } });
  check("roster ids", bit.ids, ["s1", "s2"]);
  check("total reflects the scope, not the school", bit.payload.pagination.total, 2);
  check("the query asked for that course only", [...new Set(fired.in.flat())], ["BIT"]);
  check("no admin is listed", bit.ids.includes("a1"), false);
  check("the course-less student is hidden", bit.ids.includes("s5"), false);

  console.log("--- ?course= is a Super Admin filter, and is ignored for a Course Admin ---");
  const spoof = await call({ ...BIT, query: { course: "CT", page: "1", limit: "10" } });
  check("a Course Admin asking for CT still gets BIT", spoof.ids, ["s1", "s2"]);
  check("and the Firestore query never mentions CT", fired.in.flat().includes("CT"), false);

  const superAll = await call({ ...SUPER, query: { page: "1", limit: "10" } });
  check("super with no filter sees every student", superAll.ids, ["s1", "s2", "s3", "s4", "s5"]);
  check("still no admin", superAll.ids.includes("a1"), false);
  check("and no course predicate was applied", [...new Set(fired.in.flat())], []);

  const superOne = await call({ ...SUPER, query: { course: "CT" } });
  check("super may narrow to one course", superOne.ids, ["s3"]);

  console.log("--- an admin who reaches no students gets an empty roster, not everyone ---");
  // Two DIFFERENT cases that both end in an empty list, and conflating them is how a
  // naive implementation leaks:
  //   - assigned a course that matches no students ("ZZZ"): a real query runs and
  //     Firestore returns nothing
  //   - assigned no course at all: short-circuits before any query, because
  //     dropping the predicate to "no course filter" would return the whole school
  const none = await call({ ...NONE, query: { page: "1", limit: "10" } });
  check("a course matching no student yields an empty roster", none.ids, []);
  check("total is 0", none.payload.pagination.total, 0);
  check("and it is a 200, not an error", none.statusCode, 200);
  check("the query really did run", [...new Set(fired.in.flat())], ["ZZZ"]);

  const unassigned = await call({ profile: { role: "admin", adminLevel: "course" }, query: { page: "1", limit: "10" } });
  check("an admin with no course yields an empty roster", unassigned.ids, []);
  check("total is 0", unassigned.payload.pagination.total, 0);
  check("and no Firestore query was issued at all", [...new Set(fired.in.flat())], []);

  console.log("--- a legacy multi-course admin keeps both courses ---");
  const legacy = await call({ ...LEGACY_MULTI, query: { page: "1", limit: "10" } });
  check("roster spans both", legacy.ids, ["s1", "s2", "s3"]);
  check("the query asked for both", [...new Set(fired.in.flat())].sort(), ["BIT", "CT"]);

  console.log("--- search, sort and shape ---");
  const searched = await call({ ...BIT, query: { search: "reyes", page: "1", limit: "10" } });
  check("search narrows within the scope", searched.ids, ["s2"]);
  check("and total reflects the search", searched.payload.pagination.total, 1);

  const sorted = await call({ ...BIT, query: { page: "1", limit: "10" } });
  check("rows are name-sorted", sorted.payload.data.map((r) => `${r.firstName} ${r.lastName}`), ["Ana Dela Cruz", "Ben Reyes"]);

  const row = sorted.payload.data[0];
  check("schoolId is projected", row.schoolId, "23-1");
  check("course is projected", row.course, "BIT");
  check("open/return counts are present", typeof row.openBorrows === "number" && typeof row.totalReturns === "number", true);
  check("no Firestore document leaks through", Object.keys(row).includes("createdAt"), false);

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("studentScope: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});