/**
 * Course Admin confinement on the three surfaces the audit found unscoped.
 *
 * WHY THIS FILE EXISTS
 *
 * An audit of the Super Admin / Course Admin data model found three surfaces where the
 * backend returned data from every course to a Course Admin:
 *
 *   1. /api/backup  - mounted authorize("admin") only. exportBackup serialises EVERY
 *      collection; importBackup WRITES them all back. Any Course Admin could read, or
 *      overwrite, the whole database.
 *   2. /api/manuals - a bare select("*") with no course filter at all, and create/update
 *      took `course` straight from the request body.
 *   3. /api/fines   - finesController imported no scoping helper whatsoever. Worse,
 *      `fines` has no course column: ownership lives on the user profile and the
 *      transaction, so the filter can only run AFTER enrichment.
 *
 * WHY AN EXISTING SUITE DID NOT CATCH ANY OF IT
 *
 * apiAuthz.verify.js probes /api/fines, /api/backup and /api/documents -- but only to
 * assert that a KIOSK is refused. Every one of those assertions passed for years while a
 * Course Admin was reading every course's data, because nobody had written the
 * Course-Admin case. A negative test against the wrong role is not coverage.
 *
 * So this suite is built around the Course Admin, and every negative assertion is paired
 * with a positive one proving the Super Admin is NOT over-blocked. A suite of only
 * negative checks would pass against an endpoint that rejects everybody.
 *
 * STUBBED OR REAL
 *
 * STUBBED. Firebase is a hand-rolled fake and Supabase is an in-memory client
 * (tests/helpers/inMemorySupabase.js). The app is the real `server.js` with real
 * middleware -- verifyToken -> authorize -> attachCourseScope -> handler -- so this does
 * exercise the actual authorization chain, but it is NOT a test against a real Firebase
 * project and says nothing about what production data contains.
 *
 * Run: node tests/adminSurfaceScope.verify.js
 */

const { createClient } = require("./helpers/inMemorySupabase");

const CT = "CT";
const MT = "MT";

const SUPER = "u-super";
const ADMIN_CT = "u-admin-ct";
const ADMIN_MT = "u-admin-mt";
const STU_A = "u-stu-a";
const STU_B = "u-stu-b";

const DB = {};

// Two manuals per course, so "Course A sees only Course A" is distinguishable from
// "Course A sees nothing at all".
DB.manuals = [
  { id: "man-ct-1", title: "CT Manual", course: CT, status: "Active" },
  { id: "man-ct-2", title: "CT Manual 2", course: CT, status: "Active" },
  { id: "man-mt-1", title: "MT Manual", course: MT, status: "Active" },
  { id: "man-none", title: "Unassigned Manual", course: "", status: "Active" },
];

// fines rows carry NO course column -- that is the whole problem. Ownership is only
// resolvable by following user_id / transaction_id during enrichment.
DB.fines = [
  { id: "fine-ct", user_id: STU_A, transaction_id: "tx-ct", status: "pending", total_fine: 50 },
  { id: "fine-mt", user_id: STU_B, transaction_id: "tx-mt", status: "pending", total_fine: 75 },
  { id: "fine-orphan", user_id: "u-ghost", transaction_id: "tx-missing", status: "pending", total_fine: 10 },
];

DB.transactions = [
  { id: "tx-ct", course: CT, equipment_course: CT, status: "borrowed", first_name: "Ann", last_name: "Aguilar" },
  { id: "tx-mt", course: MT, equipment_course: MT, status: "borrowed", first_name: "Ben", last_name: "Bautista" },
];

const firebaseState = { users: {} };

const ADMIN_SDK = { apps: [{}], initializeApp: () => {} };

// The fake Firestore has to resolve user profiles for real. finesController.enrichFines
// reads users with `.where(FieldPath.documentId(), "in", chunk).get()`, and the whole
// course scope is derived from what that lookup returns -- a stub that always reports
// empty would make EVERY fine unresolvable and the scoping tests would pass for the wrong
// reason (they would all be failing closed).
const firestoreDb = {
  collection: (name) => ({
    // enrichFines looks users up with .where(FieldPath.documentId(), "in", chunk), so
    // the `in` operator has to be honoured here or every profile lookup misses and every
    // fine looks unresolvable -- which would make the scoping tests pass for the wrong
    // reason (all failing closed).
    where: (field, op, value) => {
      const hit = (u) => (op === "in" ? value.map(String).includes(String(u.id)) : String(u.id) === String(value));
      return {
        limit: () => ({ get: async () => firestoreDb.collection(name).where(field, op, value).get() }),
        get: async () => {
          if (name !== "users") return { empty: true, docs: [] };
          const docs = (DB.users || []).filter(hit).map((u) => ({ id: u.id, exists: true, data: () => ({ ...u }) }));
          return { empty: docs.length === 0, docs };
        },
      };
    },
    doc: (id) => ({
      get: async () => {
        const u = (DB.users || []).find((x) => x.id === id);
        return u ? { exists: true, id, data: () => ({ ...u }) } : { exists: false };
      },
    }),
  }),
};

const authStub = {
  // Returns the shape firebase-admin's verifyIdToken produces: the uid plus identity.
  // It deliberately does NOT include `role` -- in this codebase the role is read from the
  // Firestore profile by ensureProfile, not trusted from the token, and minting claims
  // here would test a different (and weaker) authorization path than production uses.
  verifyIdToken: async (token) => {
    const uid = token.replace(/^fake-token-/, "");
    if (!firebaseState.users[uid]) {
      const err = new Error("Fake token has invalid or expired user.");
      err.code = "auth/id-token-expired";
      throw err;
    }
    return { uid, email: firebaseState.users[uid].email };
  },
  getUser: async (uid) => {
    if (!firebaseState.users[uid]) throw new Error("no such user");
    return { uid };
  },
  setCustomUserClaims: async () => {},
};

require.cache[require.resolve("../src/config/supabase")] = {
  id: require.resolve("../src/config/supabase"),
  filename: require.resolve("../src/config/supabase"),
  loaded: true,
  exports: { supabase: createClient(DB) },
};

require.cache[require.resolve("../src/config/firebase")] = {
  id: require.resolve("../src/config/firebase"),
  filename: require.resolve("../src/config/firebase"),
  loaded: true,
  exports: {
    db: firestoreDb,
    auth: authStub,
    admin: ADMIN_SDK,
    FieldPath: { documentId: () => "__name__" },
  },
};

const request = require("supertest");
const { app } = require("../server");

const put = (uid, profile) => {
  DB.users = DB.users || [];
  DB.users.push({ id: uid, ...profile });
  firebaseState.users[uid] = profile;
};

const tok = (uid) => `fake-token-${uid}`;

put(SUPER, { email: "super@x", role: "admin", adminLevel: "super", courseId: null });
put(ADMIN_CT, { email: "ct@x", role: "admin", adminLevel: "course", courseId: CT, status: "active" });
put(ADMIN_MT, { email: "mt@x", role: "admin", adminLevel: "course", courseId: MT, status: "active" });
put(STU_A, { email: "a@x", role: "student", course: CT, schoolId: "S-A", firstName: "Ann", lastName: "Aguilar" });
put(STU_B, { email: "b@x", role: "student", course: MT, schoolId: "S-B", firstName: "Ben", lastName: "Bautista" });

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

const fineIds = (b) => (Array.isArray(b) ? b : (b && (b.fines || b.data)) || []).map((f) => f.id);

const asCT = (r) => request(app)[r.method](r.path).set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
const asSuper = (r) => request(app)[r.method](r.path).set("Authorization", `Bearer ${tok(SUPER)}`);

(async () => {
  // ================================================================= BACKUP
  console.log("--- backup is Super Admin only, on every route ---");
  for (const [method, path] of [
    ["post", "/api/backup/export"],
    ["get", "/api/backup/download"],
    ["post", "/api/backup/import"],
    ["get", "/api/backup/history"],
  ]) {
    const r = await request(app)[method](path).set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
    check(`Course Admin is refused ${method.toUpperCase()} ${path}`, r.status, 403);
  }
  const superHistory = await asSuper({ method: "get", path: "/api/backup/history" });
  check("Super Admin is NOT blocked from /api/backup/history", superHistory.status !== 403, true);

  // ================================================================= MANUALS
  console.log("--- manuals: a Course Admin sees only its own course ---");
  const ctManuals = await asCT({ method: "get", path: "/api/manuals" });
  check("Course Admin list returns 200", ctManuals.status, 200);
  check("  and only CT manuals", (ctManuals.body || []).map((m) => m.id).sort(), ["man-ct-1", "man-ct-2"]);

  console.log("--- manuals: a foreign manual is invisible by id ---");
  check("GET a MT manual -> 404", (await asCT({ method: "get", path: "/api/manuals/man-mt-1" })).status, 404);
  check("Super Admin can read it", (await asSuper({ method: "get", path: "/api/manuals/man-mt-1" })).status, 200);

  console.log("--- manuals: a foreign manual cannot be written or deleted ---");
  const before = JSON.stringify(DB.manuals);
  const up = await request(app)
    .put("/api/manuals/man-mt-1")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({ title: "hijacked" });
  check("PUT a MT manual -> 404", up.status, 404);
  const del = await request(app)
    .delete("/api/manuals/man-mt-1")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({});
  check("DELETE a MT manual -> 404", del.status, 404);
  check("  and the MT manual is untouched", JSON.stringify(DB.manuals), before);

  console.log("--- manuals: a client-supplied course ID cannot widen access ---");
  const createForeign = await request(app)
    .post("/api/manuals")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({ title: "Sneaky", course: MT });
  check("create with course=MT -> 400", createForeign.status, 400);
  check("  and nothing was created", DB.manuals.length, 4);

  const createOwn = await request(app)
    .post("/api/manuals")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({ title: "Legit", course: CT });
  check("create with course=CT -> 201", createOwn.status, 201);

  console.log("--- manuals: an owned manual cannot be MOVED to another course ---");
  const moved = await request(app)
    .put("/api/manuals/man-ct-1")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({ course: MT });
  check("moving to MT -> 400", moved.status, 400);
  check("  and the course is unchanged", DB.manuals.find((m) => m.id === "man-ct-1").course, CT);

  console.log("--- manuals: student read access is preserved (deliberate) ---");
  const studentManuals = await request(app)
    .get("/api/manuals")
    .set("Authorization", `Bearer ${tok(STU_A)}`);
  check("a student may still list manuals", studentManuals.status, 200);
  check("  and writes remain admin-only",
    (await request(app).post("/api/manuals").set("Authorization", `Bearer ${tok(STU_A)}`).send({ title: "x" })).status,
    403);

  // ================================================================= FINES
  console.log("--- fines: a Course Admin sees only fines its course owns ---");
  const ctFines = await asCT({ method: "get", path: "/api/fines" });
  check("Course Admin fines list returns 200", ctFines.status, 200);
  check("  and only the CT fine", fineIds(ctFines.body), ["fine-ct"]);

  console.log("--- fines: an unresolvable fine is Super Admin only (fails closed) ---");
  check("the orphan fine is NOT returned to a Course Admin",
    fineIds(ctFines.body).includes("fine-orphan"), false);

  console.log("--- fines: a client-supplied course filter cannot widen access ---");
  const widened = await request(app)
    .get("/api/fines?course=MT")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
// The honest expectation is EMPTY, not "still only CT". `?course=MT` is a display
  // filter, and it intersects with the caller's scope: CT-in-scope AND course=MT is the
  // empty set. Returning fine-mt here would be the vulnerability; returning [] is the
  // proof that a client-supplied course ID can only ever NARROW what an admin sees.
  check("?course=MT returns 200", widened.status, 200);
  check("  but yields nothing (scope AND filter, never a union)", fineIds(widened.body), []);

  console.log("--- fines: a foreign fine cannot be paid or waived by id ---");
  const finesBefore = JSON.stringify(DB.fines);
  const pay = await request(app)
    .put("/api/fines/fine-mt/pay")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({});
  check("paying a MT fine -> 404", pay.status, 404);
  const waive = await request(app)
    .put("/api/fines/fine-mt/waive")
    .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
    .send({ reason: "not mine" });
  check("waiving a MT fine -> 404", waive.status, 404);
  check("  and no fine was modified", JSON.stringify(DB.fines), finesBefore);

  console.log("--- fines: the owning course can still act, and Super Admin is not blocked ---");
  check("paying an OWN fine -> 200",
    (await request(app).put("/api/fines/fine-ct/pay").set("Authorization", `Bearer ${tok(ADMIN_CT)}`).send({})).status,
    200);
  check("Super Admin can pay any fine",
    (await request(app).put("/api/fines/fine-mt/pay").set("Authorization", `Bearer ${tok(SUPER)}`).send({})).status,
    200);

  console.log("--- fines: cross-course equipment damage stays visible to the owner ---");
  // The whole point of carrying equipmentCourse separately: a CT student damaging MT
  // equipment must be visible to the MT admin (it is their item), and to the CT admin
  // (it is their student). Both audiences, not one winner chosen by accident.
  DB.transactions.push({ id: "tx-x", course: CT, equipment_course: MT, status: "borrowed", first_name: "Ann", last_name: "Aguilar" });
  DB.fines.push({ id: "fine-cross", user_id: STU_A, transaction_id: "tx-x", status: "pending", total_fine: 99 });
  const ctSeen = await request(app).get("/api/fines").set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
  const mtSeen = await request(app).get("/api/fines").set("Authorization", `Bearer ${tok(ADMIN_MT)}`);
  const ids = (b) => fineIds(b);
  check("CT admin sees it (their student)", ids(ctSeen.body).includes("fine-cross"), true);
  check("MT admin sees it (their equipment)", ids(mtSeen.body).includes("fine-cross"), true);

  console.log("");
  if (failures) {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("adminSurfaceScope: all checks passed.");
  process.exit(0);
})();
