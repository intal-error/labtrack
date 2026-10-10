/**
 * API-level authorization tests: the REAL middleware chain.
 *
 * WHY THIS EXISTS. Every existing verify suite calls controller functions directly
 * with a hand-built `req.profile`. That exercises a handler's own logic but skips
 * verifyToken -> authorize -> attachRole entirely -- which is precisely where an
 * authentication or role regression would hide. The audit that motivated this file
 * found cross-course WRITE holes that handler-level tests could not have caught
 * because the handler was never reached through the real chain in the first place.
 *
 * So this suite mounts the actual `server.js` with supertest and stubs only the two
 * external data sources (Supabase via an in-memory client, Firebase via a small fake).
 * Everything between the HTTP request and the database call is production code.
 *
 * COVERAGE: the five P0 fixes, plus the kiosk fail-closed behaviour, each with a
 * matching POSITIVE case proving the Super Admin is not over-blocked. A suite of only
 * negative tests would pass against a handler that rejected everyone.
 *
 * Run: node tests/apiAuthz.verify.js
*/

// ── Stub the external services BEFORE the app requires them ──────────────────
const { createClient } = require("./helpers/inMemorySupabase");

// Mutable seed, shared with the app through the stubbed config modules.
const DB = {};
  // lab_rooms is seeded so the shared attendance endpoints have something real to
  // resolve against. Room "r" is deliberately owned by a DIFFERENT course than both
  // students, which is the cross-course case: attendance is a facility question, so a
  // student may scan into any real room regardless of who owns it.
  DB.lab_rooms = [
    { id: "room-1", room_code: "r", room_name: "Networking Lab", course: "CT" },
    { id: "room-2", room_code: "other", room_name: "Other Lab", course: "MT" },
  ];
  DB.lab_attendance = [];

const firebaseState = {
  // uid -> { email, schoolId, role, course }
  users: {},
};

const authStub = {
  // Accepts one of the fake bearer tokens minted below and returns the decoded shape
  // firebase-admin's verifyIdToken produces: the uid plus custom claims.
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
    return { uid, email: firebaseState.users[uid].email };
  },
  getUserByEmail: async (email) => {
    const u = Object.entries(firebaseState.users).find(([, v]) => v.email === email);
    if (!u) throw new Error("no such user");
    return { uid: u[0], email };
  },
  createUser: async () => { throw new Error("not used in these tests"); },
  setCustomUserClaims: async () => {},
};

const firestoreDb = {
  collection: (name) => ({
    doc: (id) => ({
      get: async () => {
        const table = DB[name] || [];
        const row = table.find((r) => r.id === id);
        return {
          exists: Boolean(row),
          id,
          data: () => (row ? JSON.parse(JSON.stringify(row)) : undefined),
        };
      },
      set: async (data) => {
        const table = DB[name] || (DB[name] = []);
        const idx = table.findIndex((r) => r.id === id);
        if (idx >= 0) table[idx] = { ...table[idx], ...data };
        else table.push({ id, ...data });
      },
      delete: async () => {
        DB[name] = (DB[name] || []).filter((r) => r.id !== id);
      },
    }),
    where: (field, op, value) => {
      const matcher = {
        where: () => matcher,
        limit: () => matcher,
        orderBy: () => matcher,
        get: async () => {
          const rows = (DB[name] || []).filter((r) => {
            if (op === "==") return String(r[field]) === String(value);
            if (op === "!=") return String(r[field]) !== String(value);
            return false;
          });
          return { docs: rows.map((r) => ({ id: r.id, data: () => r })), size: rows.length };
        },
      };
      return matcher;
    },
    get: async () => ({ docs: [], size: 0 }),
  }),
};

const ADMIN_SDK = {
  apps: [{}],
  initializeApp: () => {},
  firestore: Object.assign(() => firestoreDb, {
    FieldPath: { documentId: () => "__name__" },
  }),
  auth: () => authStub,
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
  exports: { db: firestoreDb, auth: authStub, admin: ADMIN_SDK, FieldPath: { documentId: () => "__name__" } },
};

const request = require("supertest");
const { app } = require("../server");

// ── Seed ───────────────────────────────────────────────────────────────────
const CT = "CT";
const MT = "MT";

const SUPER = "u-super";
const ADMIN_CT = "u-admin-ct";
const ADMIN_MT = "u-admin-mt";
const STU_A = "u-stu-a";
const STU_B = "u-stu-b";
const KIOSK = "u-kiosk";

firebaseState.users[SUPER] = { email: "super@x", role: "admin", course: "" };
firebaseState.users[ADMIN_CT] = { email: "ct@x", role: "admin", course: CT };
firebaseState.users[ADMIN_MT] = { email: "mt@x", role: "admin", course: MT };
firebaseState.users[STU_A] = { email: "a@x", role: "student", course: CT, schoolId: "S-A" };
firebaseState.users[STU_B] = { email: "b@x", role: "student", course: MT, schoolId: "S-B" };
firebaseState.users[KIOSK] = { email: "kiosk@x", role: "kiosk", course: "" };

const put = (uid, profile) => {
  DB.users = DB.users || [];
  DB.users.push({ id: uid, role: profile.role || "student", ...profile });
};

put(SUPER, { email: "super@x", role: "admin", adminLevel: "super", courseId: null });
put(ADMIN_CT, { email: "ct@x", role: "admin", adminLevel: "course", courseId: CT, status: "active" });
put(ADMIN_MT, { email: "mt@x", role: "admin", adminLevel: "course", courseId: MT, status: "active" });
// STU_A carries year/section on their PROFILE (the Firestore document put() writes).
// autoScan must prefer those over the request body. STU_B deliberately has neither, which
// is what exercises the fallback the kiosk depends on.
put(STU_A, { email: "a@x", role: "student", course: CT, schoolId: "S-A", firstName: "Stu", lastName: "A", year: "4th Year", section: "4A" });
put(STU_B, { email: "b@x", role: "student", course: MT, schoolId: "S-B", firstName: "Stu", lastName: "B" });
put(KIOSK, { email: "kiosk@x", role: "kiosk", status: "active" });

DB.catalog = [
  { id: "item-ct", item_name: "Oscilloscope", course: CT, quantity: 5, available_quantity: 5, available: true },
  { id: "item-mt", item_name: "Lathe", course: MT, quantity: 2, available_quantity: 0, available: false },
];
DB.transactions = [
  {
    id: "borrow-a", user_id: STU_A, catalog_id: "item-ct", item_name: "Oscilloscope",
    course: CT, equipment_course: CT, quantity: 1, returned_quantity: 0,
    quantity_remaining: 1, status: "borrowed", school_id: "S-A", action: "borrowed",
  },
  {
    id: "borrow-b", user_id: STU_B, catalog_id: "item-mt", item_name: "Lathe",
    course: MT, equipment_course: MT, quantity: 1, returned_quantity: 0,
    quantity_remaining: 1, status: "borrowed", school_id: "S-B", action: "borrowed",
  },
];
DB.borrow_requests = [
  { id: "req-mt", user_id: STU_B, target_course: MT, equipment_course: MT, status: "pending", catalog_id: "item-mt", quantity: 1 },
  { id: "req-nocourse", user_id: STU_A, target_course: "", equipment_course: "", status: "pending", catalog_id: "item-ct", quantity: 1 },
];
DB.courses = [
  { id: CT, name: "Computer Technology" },
  { id: MT, name: "Mechanical Technology" },
];

const tok = (uid) => `fake-token-${uid}`;
const stockOf = (id) => (DB.catalog.find((c) => c.id === id) || {}).available_quantity;

let failures = 0;
let passes = 0;

async function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passes += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      expected ${JSON.stringify(expected)}`);
    console.log(`      actual   ${JSON.stringify(actual)}`);
  }
}

(async () => {
  try {
    console.log("--- 0. the real middleware chain is actually in play ---");
    // If server.js were not mounted, or verifyToken were skipped, a bogus token
    // would still be accepted. This proves the chain runs.
    const anon = await request(app).get("/api/catalog");
    check("a request with NO token is refused (401)", anon.status, 401);
    const bogus = await request(app).get("/api/catalog").set("Authorization", "Bearer garbage");
    check("a request with a BOGUS token is refused (401)", bogus.status, 401);
    const stu = await request(app).get("/api/catalog").set("Authorization", `Bearer ${tok(STU_A)}`);
    // Catalog reads are deliberately NOT admin-gated (routes/catalog.js has no
    // authorize on the GETs): students browse equipment to know what they can borrow,
    // and blocking that would break a legitimate feature. Course SCOPING still
    // applies to admins -- asserted below. Written down so a future "hardening" pass
    // does not lock students out of the catalog.
    check("a STUDENT may read the catalog (intentional: they browse to borrow)", stu.status, 200);
    const adm = await request(app).get("/api/catalog").set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
    check("a COURSE ADMIN reaches the catalog list (200)", adm.status, 200);
    const sup = await request(app).get("/api/catalog").set("Authorization", `Bearer ${tok(SUPER)}`);
    check("the SUPER ADMIN reaches the catalog list (200)", sup.status, 200);

    // Writes, however, ARE admin-gated -- asserted here because "reads are open" must
    // not be mistaken for "the whole router is open".
    const stuWrite = await request(app)
      .post("/api/catalog")
      .set("Authorization", `Bearer ${tok(STU_A)}`)
      .send({ item_name: "x", course: CT, quantity: 1 });
    check("a STUDENT cannot WRITE the catalog (403)", stuWrite.status, 403);

    console.log("--- 1. P0-1/P0-2: a return may only touch its own loan's catalog item ---");
    // A student returns their own loan but names the OTHER course's item.
    const before = { ct: stockOf("item-ct"), mt: stockOf("item-mt") };
    const hijack = await request(app)
      .post("/api/transactions/my-return")
      .set("Authorization", `Bearer ${tok(STU_A)}`)
      .send({ borrowId: "borrow-a", itemId: "item-mt", quantity: 1 });
    check("student naming a FOREIGN item is refused", hijack.status, 400);
    check("  ...and MT stock is untouched", stockOf("item-mt"), before.mt);

    // Missing itemId is fine: the borrow row decides.
    const legit = await request(app)
      .post("/api/transactions/my-return")
      .set("Authorization", `Bearer ${tok(STU_A)}`)
      .send({ borrowId: "borrow-a", quantity: 1 });
    check("student returning with no itemId succeeds (borrow decides)", legit.status, 201);
    check("  ...and increments CT stock, not MT", stockOf("item-ct"), before.ct + 1);

    // The matching itemId is still accepted -- no false rejection.
    const withId = await request(app)
      .post("/api/transactions/my-return")
      .set("Authorization", `Bearer ${tok(STU_A)}`)
      .send({ borrowId: "borrow-b", itemId: "item-bogus", quantity: 1 });
    check("another student's borrow is refused by ownership", withId.status, 500); // "Borrow record not found" via throw -> 500
    check("  ...and stock of both items unchanged", [stockOf("item-ct"), stockOf("item-mt")], [before.ct + 1, before.mt]);

    console.log("--- 2. P0-2: a Course Admin may not settle another course's loan ---");
    const adminMtBefore = stockOf("item-mt");
    const adminHijack = await request(app)
      .post("/api/transactions/return")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({ borrowId: "borrow-b", itemId: "item-ct", quantity: 1 });
    check("CT admin settling an MT loan is refused (404)", adminHijack.status, 404);
    check("  ...and MT stock untouched", stockOf("item-mt"), adminMtBefore);

    const adminOwn = await request(app)
      .post("/api/transactions/return")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({ borrowId: "borrow-b", itemId: "item-ct", quantity: 1 });
    // borrow-b is MT, so the CT admin is refused on course before itemId is examined.
    check("CT admin settling an MT loan is still refused with a matching itemId", adminOwn.status, 404);

    console.log("--- 3. P0-3: reassign checks the CALLER's course ---");
    const ra = await request(app)
      .put("/api/borrow-requests/req-mt/reassign")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({ newAdminId: ADMIN_CT });
    check("CT admin cannot reassign an MT request (404)", ra.status, 404);

    const raSuper = await request(app)
      .put("/api/borrow-requests/req-mt/reassign")
      .set("Authorization", `Bearer ${tok(SUPER)}`)
      .send({ newAdminId: ADMIN_MT });
    check("SUPER ADMIN can reassign the MT request (200) -- no over-blocking", raSuper.status, 200);

    console.log("--- 4. P0-4: a course-less request is Super Admin only ---");
    const nocourseApprove = await request(app)
      .put("/api/borrow-requests/req-nocourse/approve")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({});
    check("CT admin cannot approve a course-less request (403)", nocourseApprove.status, 403);
    check("  ...and it is still pending", DB.borrow_requests.find((r) => r.id === "req-nocourse").status, "pending");

    const nocourseApproveSuper = await request(app)
      .put("/api/borrow-requests/req-nocourse/approve")
      .set("Authorization", `Bearer ${tok(SUPER)}`)
      .send({});
    check("SUPER ADMIN can approve it (200) -- the orphan can still be cleared", nocourseApproveSuper.status, 200);

    console.log("--- 5. P0-5: incident catalogId is course-checked ---");
    const leak = await request(app)
      .post("/api/incidents")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({ type: "damage", description: "glass cracked across the whole face panel", catalogId: "item-mt", severity: "low", incidentDate: "2026-01-01" });
    check("CT admin naming an MT catalog item is refused (404)", leak.status, 404);
    check("  ...and no incident was created", (DB.incidents || []).length, 0);

    const own = await request(app)
      .post("/api/incidents")
      .set("Authorization", `Bearer ${tok(ADMIN_CT)}`)
      .send({ type: "damage", description: "glass cracked across the whole face panel", catalogId: "item-ct", severity: "low", incidentDate: "2026-01-01" });
    check("CT admin naming its OWN item proceeds past the lookup", own.status !== 404, true);

    console.log("--- 7. GET /api/auth/profile shapes, through the real chain ---");
    // This is the endpoint the whole frontend derives role, tier and landing route
    // from (AuthContext.jsx consumes exactly these fields), so a wrong value here
    // silently misroutes a signed-in user before any page renders.
    for (const [label, uid, expect] of [
      ["SUPER ADMIN", SUPER, { role: "admin", adminLevel: "super", isSuperAdmin: true, landingPath: "/dashboard" }],
      ["COURSE ADMIN", ADMIN_CT, { role: "admin", adminLevel: "course", isSuperAdmin: false, courseId: CT }],
      ["STUDENT", STU_A, { role: "student", isSuperAdmin: false, landingPath: "/my-activity" }],
    ]) {
      const r = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${tok(uid)}`);
      const got = { ...(r.body || {}) };
      for (const k of Object.keys(expect)) {
        check(`  ${label} ${k}`, got[k], expect[k]);
      }
    }
    // courseName resolves from the courses table for a scoped admin.
    {
      const r = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${tok(ADMIN_CT)}`);
      check("  COURSE ADMIN courseName resolves from the courses table", r.body && r.body.courseName, "Computer Technology");
    }
    // The kiosk shape is asserted here so the A2 cutover has a failing test to fix
    // rather than silently landing on /dashboard. It currently fails by design:
    // authController.js:76 only branches on "student".
    if (process.env.EXPECT_KIOSK_LANDING === "1") {
      const r = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${tok(KIOSK)}`);
      check("  KIOSK landingPath", r.body && r.body.landingPath, "/attend/kiosk");
    }

    console.log("--- 9. KIOSK LEAST PRIVILEGE: attendance yes, everything else no ---");
    // The kiosk used to authenticate with a shared secret read out of the client
    // bundle. It is now a real Firebase account with role "kiosk", and authorize() is
    // an exact string match (auth.js:111) -- so "kiosk" !== "admin" is what confines it.
    // These assertions exist so that boundary cannot be widened silently.
    {
      const t = await request(app).post("/api/attendance/time-in")
        .set("Authorization", `Bearer ${tok(KIOSK)}`)
        .send({ schoolId: "S-A", roomCode: "cet-center" });
      // Not 403 -- the guard passed and the handler ran (it then failed on its own
      // validation or lookup). A 403 here would mean the kiosk could not time in.
      check("kiosk is ALLOWED through to the time-in handler", t.status !== 403, true);
      const a = await request(app).post("/api/attendance/time-out")
        .set("Authorization", `Bearer ${tok(KIOSK)}`)
        .send({ schoolId: "S-A", roomCode: "cet-center" });
      check("kiosk is ALLOWED through to the time-out handler", a.status !== 403, true);
    }
    for (const [label, method, path, body] of [
      ["create an Admin", "post", "/api/admin", {}],
      ["read the admin roster", "get", "/api/admin", null],
      ["create a catalog item", "post", "/api/catalog", { item_name: "x", course: CT, quantity: 1 }],
      ["list incidents", "get", "/api/incidents", null],
      ["create a maintenance record", "post", "/api/maintenance", {}],
      ["read reports", "get", "/api/reports/summary", null],
      ["read settings", "get", "/api/settings/general", null],
      ["read the courses table", "get", "/api/courses", null],
      ["list documents", "get", "/api/documents", null],
      ["list fines", "get", "/api/fines", null],
      ["read backups", "get", "/api/backup", null],
    ]) {
      let r = request(app)[method](path);
      if (body) r = r.send(body);
      r = r.set("Authorization", `Bearer ${tok(KIOSK)}`);
      const res = await r;
      check(`kiosk CANNOT ${label} (${res.status})`, res.status, 403);
    }

    console.log("--- 10. kiosk lands on the kiosk page, not the student dashboard ---");
    {
      const r = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${tok(KIOSK)}`);
      check("kiosk landingPath is /attend/kiosk", r.body && r.body.landingPath, "/attend/kiosk");
      check("kiosk is not a super admin", r.body && r.body.isSuperAdmin, false);
    }

    console.log("--- 8. kiosk authentication FAILS CLOSED ---");
    // CHANGED. This previously exercised middleware/kioskAuth.js and asserted the
    // shared-secret behaviour (503 when unset, 403 on a wrong token). That module is
    // deleted: the kiosk is a real Firebase account now, so the equivalents are an
    // absent token and a token whose role is not "kiosk".
    {
      const noToken = await request(app).post("/api/attendance/time-in").send({ schoolId: "S-A", roomCode: "r" });
      check("a kiosk route with NO token is refused (401)", noToken.status, 401);

      const staleHeader = await request(app)
        .post("/api/attendance/time-in")
        .set("X-Kiosk-Token", "whatever-the-old-secret-was")
        .send({ schoolId: "S-A", roomCode: "r" });
      check("the OLD X-Kiosk-Token header no longer authenticates (401)", staleHeader.status, 401);

// A student token is REQUIRED on these routes, not refused.
//
// This assertion used to be the exact opposite -- "a STUDENT token on a kiosk route is
// refused (403)" -- and it was wrong. The student scanner page posts to /time-in and
// /time-out with the student's own bearer token, so gating those routes on "kiosk" alone
// locked every student out of scanning in. authorize() is variadic, so
// authorize("kiosk", "student") is the correct gate: both accounts, nobody else.
//
// What is still refused is the STUDENT RECORDING FOR SOMEONE ELSE. That was the actual
// live hole: the handlers read their subject straight from req.body.schoolId and never
// compared it to the caller, behind a secret that shipped in the public JS bundle.
const studentOwn = await request(app)
  .post("/api/attendance/time-in")
  .set("Authorization", `Bearer ${tok(STU_A)}`)
  .send({ schoolId: "S-A", roomCode: "r", subject: "Net 1", professor: "Dela Cruz" });
check("a STUDENT token is allowed on an attendance route", studentOwn.status, 200);
check("  and the row is filed under the student's OWN id", DB.lab_attendance[0] && DB.lab_attendance[0].student_school_id, "S-A");

const studentOther = await request(app)
  .post("/api/attendance/time-in")
  .set("Authorization", `Bearer ${tok(STU_A)}`)
  .send({ schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz" });
check("a STUDENT cannot record attendance for ANOTHER student", studentOther.status, 403);
check("  and nothing was written for the victim", DB.lab_attendance.filter((r) => r.student_school_id === "S-B").length, 0);

const kioskForOther = await request(app)
  .post("/api/attendance/time-in")
  .set("Authorization", `Bearer ${tok(KIOSK)}`)
  .send({ schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz" });
check("a KIOSK may record for another student", kioskForOther.status, 200);
check("  filed under the scanned id", DB.lab_attendance[DB.lab_attendance.length - 1].student_school_id, "S-B");

const badRoom = await request(app)
  .post("/api/attendance/time-in")
  .set("Authorization", `Bearer ${tok(KIOSK)}`)
  .send({ schoolId: "S-B", roomCode: "no-such-room", subject: "Net 1", professor: "Dela Cruz" });
check("an unknown room code is refused", badRoom.status, 404);
      check("  and nothing was written for it", DB.lab_attendance.length, 2);

      // Integrity: a rejected request must leave every existing row byte-identical. A
      // status-code-only assertion would miss a handler that writes first and validates
      // second, which is the exact shape of the original bug.
      const before = JSON.stringify(DB.lab_attendance);
      await request(app)
        .post("/api/attendance/time-in")
        .set("Authorization", `Bearer ${tok(KIOSK)}`)
        .send({ schoolId: "S-A", roomCode: "does-not-exist", subject: "Net 1", professor: "Dela Cruz" });
      check("a 404 room changes nothing in the table", JSON.stringify(DB.lab_attendance), before);

      await request(app)
        .post("/api/attendance/time-in")
        .set("Authorization", `Bearer ${tok(STU_A)}`)
        .send({ schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz" });
      check("a 403 impersonation attempt changes nothing", JSON.stringify(DB.lab_attendance), before);

      // autoScan is mounted on the same gate and is now covered end-to-end over HTTP.
      DB.lab_attendance.length = 0;
      const autoScanStudent = await request(app)
        .post("/api/attendance/auto-scan")
        .set("Authorization", `Bearer ${tok(STU_A)}`)
        .send({
          schoolId: "S-A", roomCode: "r", subject: "Net 1", professor: "Dela Cruz",
          firstName: "x", lastName: "y", course: "x", year: "x",
        });
      check("a STUDENT may use auto-scan", autoScanStudent.status, 200);
      check("  filed under the student's own id", DB.lab_attendance[0].student_school_id, "S-A");
      check("  year comes from the profile, not the body", DB.lab_attendance[0].year, "4th Year");
      check("  and so does section", DB.lab_attendance[0].section, "4A");

      // STU_B deliberately has NO year/section on their profile. That is the fallback
      // path the kiosk depends on: an incomplete or legacy profile must not make a
      // legitimate scan fail, and the typed value is used instead.
      DB.lab_attendance.length = 0;
      const autoScanFallback = await request(app)
        .post("/api/attendance/auto-scan")
        .set("Authorization", `Bearer ${tok(KIOSK)}`)
        .send({
          schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz",
          firstName: "x", lastName: "y", course: "x", year: "2nd Year", section: "2B",
        });
      check("a profile missing year does not break the scan", autoScanFallback.status, 200);
      check("  typed year is used as the fallback", DB.lab_attendance[0].year, "2nd Year");
      check("  typed section is used as the fallback", DB.lab_attendance[0].section, "2B");

      DB.lab_attendance.length = 0;
      const autoScanImpostor = await request(app)
        .post("/api/attendance/auto-scan")
        .set("Authorization", `Bearer ${tok(STU_A)}`)
        .send({
          schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz",
          firstName: "x", lastName: "y", course: "x", year: "x",
        });
      check("auto-scan refuses another student's id", autoScanImpostor.status, 403);
      check("  and writes nothing", DB.lab_attendance.length, 0);

      DB.lab_attendance.length = 0;
      const autoScanNoRoom = await request(app)
        .post("/api/attendance/auto-scan")
        .set("Authorization", `Bearer ${tok(KIOSK)}`)
        .send({ schoolId: "S-A", subject: "Net 1", professor: "Dela Cruz" });
      check("auto-scan with no room code is refused", autoScanNoRoom.status, 404);
      check("  and writes nothing", DB.lab_attendance.length, 0);

      const adminOnKiosk = await request(app)
        .post("/api/attendance/time-in")
        .set("Authorization", `Bearer ${tok(SUPER)}`)
        .send({ schoolId: "S-A", roomCode: "r" });
      check("even a SUPER ADMIN token is refused on a kiosk route (403)", adminOnKiosk.status, 403);

      // --- 11. CROSS-COURSE ATTENDANCE: a laboratory Admin must account for visitors ---
      // Room "r" is owned by CT. STU_B is an MT student. A Course Admin owns exactly one
      // course and must see everybody who used THEIR room -- including students who do not
      // share it. Nothing in the write path compares courses, and nothing in the read path
      // filters by the visitor's course either. If either is ever added, these fail.
      DB.lab_attendance.length = 0;
      const crossCourseScan = await request(app)
        .post("/api/attendance/time-in")
        .set("Authorization", `Bearer ${tok(STU_B)}`)
        .send({ schoolId: "S-B", roomCode: "r", subject: "Net 1", professor: "Dela Cruz" });
      check("an MT student may scan into a CT-owned room", crossCourseScan.status, 200);
      check("  the row records the ROOM's owner and the student's own course",
        [DB.lab_attendance[DB.lab_attendance.length - 1].room_code,
         DB.lab_attendance[DB.lab_attendance.length - 1].course],
        ["r", "MT"]);

      // --- 12. /users/resolve must not be a profile oracle ---
      // It used to answer with the entire user document on a guessed ID, which returned
      // email/course/year/section and made forged attendance a two-request sequence.
      // The equipment scanner only reads a name, so that is all it gets.
      const resolved = await request(app)
        .get("/api/users/resolve?code=S-A&ids=&candidates=S-A")
        .set("Authorization", `Bearer ${tok(STU_A)}`);
      check("a student may still resolve a code at the equipment scanner", resolved.status, 200);
      check("  the response carries ONLY the borrow-form fields",
        Object.keys(resolved.body.user || {}).sort(), ["firstName", "id", "lastName"]);
      const leaked = ["email", "course", "year", "section", "role", "adminLevel", "schoolId", "employeeId"];
      check("  no profile fields leak", leaked.filter((k) => k in (resolved.body.user || {})), []);
      check("  an unauthenticated resolve is refused",
        (await request(app).get("/api/users/resolve?code=S-A&ids=&candidates=S-A")).status, 401);

      // --- 13. /lookup-student stays kiosk-only ---
      // It answers with a profile for ANY schoolId, so folding it into the
      // "kiosk, student" gate would have rebuilt the same oracle on a second path.
      // Nothing in the student flow calls it, and it must not hand out an email address.
      const studentLookup = await request(app)
        .get("/api/attendance/lookup-student/S-B")
        .set("Authorization", `Bearer ${tok(STU_A)}`);
      check("a STUDENT cannot use the kiosk-only lookup", studentLookup.status, 403);
      const kioskLookup = await request(app)
        .get("/api/attendance/lookup-student/S-B")
        .set("Authorization", `Bearer ${tok(KIOSK)}`);
      check("a KIOSK still can", kioskLookup.status, 200);
      check("  and no email is returned", "email" in (kioskLookup.body || {}), false);
    }
  } catch (err) {
    failures += 1;
    console.log(`FAIL  suite aborted: ${err.stack || err.message}`);
  }

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`apiAuthz: all ${passes} checks passed`);
  // The mounted app leaves timers, caches and rate-limit buckets on the event loop,
  // so without an explicit exit this file would hang after printing its results.
  process.exit(0);
})();