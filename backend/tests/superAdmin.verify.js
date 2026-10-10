/**
 * Verifies the Super Admin lifecycle guards in controllers/adminController.js.
 *
 * WHY THIS FILE EXISTS: these guards are the only thing standing between a
 * misconfiguration and a permanently unmanageable install. There is deliberately
 * no API route that can CREATE a Super Admin (scripts/set-super-admin.js is), so
 * if the guards can deactivate or demote the one that exists, there is no way
 * back -- every future Course Admin would need CLI access to the deploy host.
 *
 * So the assertions below are mostly about REFUSAL. Each one names the lockout
 * it prevents.
 *
 * The subtle one is the legacy-admin case. courseScope.js deliberately treats an
 * admin with no adminLevel as unrestricted, so that migration does not strip
 * anyone's access on deploy. The guards here therefore check adminLevel ===
 * "super" EXPLICITLY rather than calling isSuperAdmin(): if they used it, every
 * legacy admin would be frozen out of Course Admin management until migrated,
 * which is the exact lockout this file exists to rule out.
 *
 * Run: node backend/tests/superAdmin.verify.js
 */

// ── Stubs ────────────────────────────────────────────────────────────────────

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const ROSTER = {
  root: { role: "admin", adminLevel: "super", courseId: null, firstName: "Eve", lastName: "Santos", email: "eve@slsu.edu.ph", status: "active" },
  ctAdmin: { role: "admin", adminLevel: "course", courseId: "CT", firstName: "Cara", lastName: "Lim", email: "cara@slsu.edu.ph", status: "active" },
  mtAdmin: { role: "admin", adminLevel: "course", courseId: "MT", firstName: "Dan", lastName: "Ocho", email: "dan@slsu.edu.ph", status: "active" },
  // Pre-migration: no adminLevel, one assigned course.
  legacy: { role: "admin", assignedCourses: ["BIT"], firstName: "Fay", lastName: "Reyes", email: "fay@slsu.edu.ph", status: "active" },
  // Pre-migration, no courses: unrestricted under the legacy inference.
  legacyRoot: { role: "admin", assignedCourses: [], firstName: "Gil", lastName: "Reyes", email: "gil@slsu.edu.ph", status: "active" },
};

const COURSES = ["BIT", "CT", "CPT", "AT", "CTV", "ELT", "ELX", "FSM", "MT"];

// Recorded side effects, so assertions prove what was WRITTEN rather than
// inferring it from the returned response.
const state = { users: {}, admins: {}, authCalls: [], claims: [] };

function resetState() {
  state.users = {};
  state.admins = {};
  state.authCalls = [];
  state.claims = [];
  Object.entries(ROSTER).forEach(([uid, row]) => {
    state.users[uid] = { ...row };
    // adminController.create writes BOTH collections, so the legacy mirror is
    // present for every account the app made. update()'s mirror loop skips a
    // missing doc, so without seeding it the mirror assertions would silently
    // pass on a mirror that was never written.
    state.admins[uid] = { ...row };
  });
}

function matchCond(row, [field, op, value]) {
  if (op === "==") return row[field] === value;
  throw new Error(`stub does not implement ${op}`);
}

/**
 * A QuerySnapshot stand-in. It needs BOTH `docs` and `forEach`: adminController
 * uses .forEach() on the query result and .get() on single docs, and returning a
 * bare `{ size, docs }` made the controller throw "usersSnap.forEach is not a
 * function" rather than fail the assertion.
 */
function snapshot(rows) {
  const snap = { size: rows.length, docs: rows, empty: rows.length === 0 };
  snap.forEach = (fn) => rows.forEach((row, i) => fn({ id: row.id, data: () => row }, i));
  return snap;
}

/** Firestore stand-in: doc().get/set and the two where-chains the controller uses. */
function firestoreStub() {
  const storeFor = (name) => (name === "users" ? state.users : state.admins);

  const filtered = (name, conds) => {
    const rows = Object.entries(storeFor(name)).map(([id, row]) => ({ id, ...row }));
    return conds.reduce((acc, cond) => acc.filter((r) => matchCond(r, cond)), rows);
  };

  const whereChain = (name, conds) => ({
    where(field, op, value) {
      return whereChain(name, [...conds, [field, op, value]]);
    },
    async get() {
      return snapshot(filtered(name, conds));
    },
  });

  return {
    collection(name) {
      return {
        doc(uid) {
          return {
            async get() {
              const row = storeFor(name)[uid];
              return { exists: Boolean(row), id: uid, data: () => (row ? { ...row } : undefined) };
            },
            async set(data, opts) {
              const store = storeFor(name);
              store[uid] = opts && opts.merge ? { ...(store[uid] || {}), ...data } : { ...data };
            },
          };
        },
        where(field, op, value) {
          return whereChain(name, [[field, op, value]]);
        },
        async get() {
          return snapshot(filtered(name, []));
        },
      };
    },
  };
}

const authStub = {
  async createUser({ email }) {
    const uid = `new-${state.authCalls.length}`;
    state.authCalls.push(["createUser", email]);
    return { uid };
  },
  async setCustomUserClaims(uid, claims) {
    state.claims.push({ uid, claims });
  },
  async updateUser(uid, patch) {
    state.authCalls.push(["updateUser", uid, Object.keys(patch).join(",")]);
  },
};

const supabaseStub = {
  from(table) {
    let filters = [];
    const builder = {
      select() { return builder; },
      eq(column, value) { filters = [...filters, [column, value]]; return builder; },
      limit() { return builder; },
      then(resolve) {
        let rows = [];
        if (table === "courses") {
          rows = COURSES.filter((id) => filters.every(([c, v]) => (c === "id" ? id === v : true)));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  },
};

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [] };
}

stub("../src/config/firebase", { db: firestoreStub(), auth: authStub });
stub("../src/config/supabase", { supabase: supabaseStub });

// adminScope is imported for invalidateAdminsCache; the real module would open a
// Firestore read on import through the stub above, which is fine, but stubbing it
// keeps this file focused on the guards rather than the cache.
stub("../src/utils/adminScope", { invalidateAdminsCache: () => {} });

const controller = require("../src/controllers/adminController");
const { requireSuperAdmin } = require("../src/middleware/courseScope");

// ── Harness ──────────────────────────────────────────────────────────────────

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

/** Runs an async handler and returns { status, body }. */
async function call(handler, req) {
  const res = mockRes();
  await handler({ ...req, params: req.params || {} }, res);
  return { status: res.statusCode, body: res.payload };
}

const asUser = (uid) => ({ user: { uid }, profile: state.users[uid] });

const VALID_NEW_ADMIN = {
  firstName: "New",
  lastName: "Admin",
  email: "new.admin@slsu.edu.ph",
  password: "Passw0rd!",
};

// ── Tests ────────────────────────────────────────────────────────────────────

(async () => {
resetState();

console.log("--- POST /api/admin is reachable only by an explicit Super Admin ---");
check(
  "requireSuperAdmin refuses a Course Admin",
  (() => {
    const res = mockRes();
    let nexted = false;
    requireSuperAdmin({ profile: state.users.ctAdmin }, res, () => { nexted = true; });
    return { nexted, status: res.statusCode };
  })(),
  { nexted: false, status: 403 }
);
check(
  "requireSuperAdmin admits the Super Admin",
  (() => {
    const res = mockRes();
    let nexted = false;
    requireSuperAdmin({ profile: state.users.root }, res, () => { nexted = true; });
    return nexted;
  })(),
  true
);
// CHANGED, deliberately. This asserted that a course-less admin with no adminLevel
// is NOT frozen out of managing Course Admins -- i.e. that it still passed
// requireSuperAdmin. That locked in the inference removed from
// courseScope.isSuperAdmin(), on the very guard that gates creating and deactivating
// admins. The file's own header argued against a "lockout" that would freeze legacy
// admins out; the resolution was to appoint them properly, not to infer the
// appointment from an empty record. Fail closed is asserted instead.
check(
  "a course-less admin with NO adminLevel IS frozen out (fail closed)",
  (() => {
    const res = mockRes();
    let nexted = false;
    requireSuperAdmin({ profile: state.users.legacyRoot }, res, () => { nexted = true; });
    return nexted;
  })(),
  false
);
// ...and the real Super Admin still gets through, so this is not a blanket denial.
check(
  "the explicitly appointed Super Admin still manages Course Admins",
  (() => {
    const res = mockRes();
    let nexted = false;
    requireSuperAdmin({ profile: state.users.root }, res, () => { nexted = true; });
    return nexted;
  })(),
  true
);

console.log("--- create() writes the course assignment to BOTH collections ---");
{
  const res = await call(controller.create, {
    ...asUser("root"),
    body: { ...VALID_NEW_ADMIN, courseId: "CT", adminLevel: "course" },
  });
  check("created", res.status, 201);
  const uid = res.body.id;
  check("users row has adminLevel", state.users[uid].adminLevel, "course");
  check("users row has courseId", state.users[uid].courseId, "CT");
  check("users row keeps role for authorize()", state.users[uid].role, "admin");
  // The legacy mirror must carry the same fields: resolveProfile falls back to
  // `admins`, and a row found there without them reads as a legacy admin.
  check("legacy mirror has adminLevel", state.admins[uid].adminLevel, "course");
  check("legacy mirror has courseId", state.admins[uid].courseId, "CT");
  check("legacy course fields are cleared", [state.users[uid].assignedCourse, state.users[uid].assignedCourses], ["", []]);
}

console.log("--- adminLevel is NOT a custom claim ---");
{
  const res = await call(controller.create, {
    ...asUser("root"),
    body: { ...VALID_NEW_ADMIN, email: "second@slsu.edu.ph", courseId: "MT", adminLevel: "course" },
  });
  check("created", res.status, 201);
  check("only { role } is claimed, never adminLevel/courseId", state.claims[0].claims, { role: "admin" });
  check("so a course change needs no token refresh", Object.keys(state.claims[0].claims).includes("courseId"), false);
}

console.log("--- create() refuses to mint a Super Admin ---");
{
  resetState();
  const res = await call(controller.create, {
    ...asUser("root"),
    body: { ...VALID_NEW_ADMIN, adminLevel: "super", courseId: "CT" },
  });
  check("adminLevel=super is a 400", res.status, 400);
  check("and points at the script", /set-super-admin/.test(res.body.error), true);
  check("no account was created", Object.keys(state.users).some((k) => k.startsWith("new-")), false);
}

console.log("--- create() validates the course ---");
{
  resetState();
  const noCourse = await call(controller.create, { ...asUser("root"), body: { ...VALID_NEW_ADMIN } });
  check("a missing course is a 400", noCourse.status, 400);
  const badCourse = await call(controller.create, {
    ...asUser("root"),
    body: { ...VALID_NEW_ADMIN, courseId: "NOPE" },
  });
  check("an unknown course is a 400", badCourse.status, 400);
  check("and no account was created", Object.keys(state.users).some((k) => k.startsWith("new-")), false);
}

console.log("--- the Super Admin account is immutable ---");
{
  resetState();
  // adminLevel:"course" is the one value the schema allows, so the tier guard
  // does not fire; the refusal comes from the courseId guard, because pushing the
  // Super Admin into a course is the operation that actually strips their scope.
  const demote = await call(controller.update, {
    ...asUser("root"),
    params: { id: "root" },
    body: { firstName: "Eve", lastName: "Santos", adminLevel: "course", courseId: "CT" },
  });
  check("the Super Admin cannot be demoted through the API", demote.status, 403);
  check("and is still a super admin", state.users.root.adminLevel, "super");
  check("and still has no course", state.users.root.courseId, null);
}
{
  resetState();
  const promote = await call(controller.update, {
    ...asUser("ctAdmin"),
    params: { id: "ctAdmin" },
    body: { firstName: "Cara", lastName: "Lim", adminLevel: "super" },
  });
  check("a Course Admin cannot promote themselves", promote.status, 400);
  check("and is still a course admin", state.users.ctAdmin.adminLevel, "course");
}
{
  resetState();
  const res = await call(controller.update, {
    ...asUser("root"),
    params: { id: "root" },
    body: { courseId: "CT" },
  });
  check("the Super Admin cannot be pushed into a course", res.status, 403);
}
{
  resetState();
  const profile = await call(controller.update, {
    ...asUser("root"),
    params: { id: "root" },
    body: { firstName: "Evelyn", lastName: "Santos", contact: "0917" },
  });
  check("the Super Admin can still edit their own name", profile.status, 200);
  check("their tier is not touched by a profile edit", state.users.root.adminLevel, "super");
  check("their name did change", state.users.root.firstName, "Evelyn");
}
{
  resetState();
  const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "root" } });
  check("self-deactivation is refused", res.status, 400);

  const other = { ...asUser("ctAdmin"), user: { uid: "mtAdmin" } };
  const viaCourseAdmin = await call(controller.toggleStatus, { ...other, params: { id: "root" } });
  check("another Course Admin cannot deactivate them", viaCourseAdmin.status, 403);

  const del = await call(controller.remove, { ...asUser("ctAdmin"), user: { uid: "mtAdmin" }, params: { id: "root" } });
  check("a Course Admin cannot delete them", del.status, 403);

  const byRoot = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "root" }, user: { uid: "mtAdmin" } });
  check("nor the Super Admin, via another uid", byRoot.status, 403);
}

console.log("--- reassigning an admin to another course is Super Admin only ---");
{
  resetState();
  const byCourseAdmin = await call(controller.update, {
    ...asUser("ctAdmin"),
    params: { id: "ctAdmin" },
    body: { firstName: "Cara", lastName: "Lim", courseId: "MT" },
  });
  check("a Course Admin moving themselves is a 403", byCourseAdmin.status, 403);
  check("their course is untouched", state.users.ctAdmin.courseId, "CT");
}
{
  resetState();
  const bySelf = await call(controller.update, {
    ...asUser("ctAdmin"),
    params: { id: "ctAdmin" },
    body: { firstName: "Cara", lastName: "Lim", contact: "", position: "" },
  });
  check("a Course Admin editing their own name still works", bySelf.status, 200);
  check("and their course is preserved", state.users.ctAdmin.courseId, "CT");
}
{
  resetState();
  const byRoot = await call(controller.update, {
    ...asUser("root"),
    params: { id: "ctAdmin" },
    body: { firstName: "Cara", lastName: "Lim", courseId: "MT" },
  });
  check("the Super Admin can reassign", byRoot.status, 200);
  check("users collection follows", state.users.ctAdmin.courseId, "MT");
  check("legacy mirror follows", state.admins.ctAdmin.courseId, "MT");
}
{
  resetState();
  const bad = await call(controller.update, {
    ...asUser("root"),
    params: { id: "ctAdmin" },
    body: { firstName: "Cara", lastName: "Lim", courseId: "NOPE" },
  });
  check("an unknown target course is a 400", bad.status, 400);
}
{
  resetState();
  const other = await call(controller.update, {
    ...asUser("ctAdmin"),
    params: { id: "mtAdmin" },
    body: { firstName: "Dan", lastName: "Ocho" },
  });
  check("a Course Admin editing another admin is a 403", other.status, 403);
}

console.log("--- the roster is not enumerable by a Course Admin ---");
{
  resetState();
  const res = await call(controller.getAll, asUser("ctAdmin"));
  check("only their own record", res.body.map((a) => a.id), ["ctAdmin"]);
}
{
  resetState();
  const res = await call(controller.getAll, asUser("root"));
  check("the Super Admin sees everyone", res.body.map((a) => a.id).sort(), ["ctAdmin", "legacy", "legacyRoot", "mtAdmin", "root"]);
}
{
  resetState();
  state.users.ctAdmin.status = "inactive";
  const res = await call(controller.getActiveAdmins, asUser("ctAdmin"));
  check("an inactive Course Admin is not in their own active list", res.body, []);
}

console.log("");
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("superAdmin: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});