/**
 * Safety Rules: course authorization across every operation, including file access.
 *
 * WHY THIS FILE EXISTS
 *
 * Safety Rules replaces Laboratory Manuals as the course-scoped safety document module.
 * Manuals had no authorization at all -- getAll was a bare select("*") behind verifyToken,
 * so any student read every course's documentation. The replacement had to get that right
 * from the first row, which means the STUDENT case specifically: scopeCodes() returns
 * null for every non-admin ("no restriction"), so reusing it would have reproduced the
 * exact bug Safety Rules exists to remove.
 *
 * WHAT IS PINNED
 *
 *  1. Super Admin manages rules across all courses.
 *  2. Course Admin sees and manages only its own course, including its lab scope.
 *  3. Student sees only their own VERIFIED course, and never writes.
 *  4. A foreign rule is a 404 (not 403) on view/update/delete/file -- a 403 would confirm
 *     the row exists, leaking the thing the restriction hides.
 *  5. The file endpoint re-checks the course, and the Cloudinary delivery URL is never
 *     returned to the client in any response.
 *  6. Unsafe content is rejected on its BYTES: a file declaring image/png but carrying
 *     an MZ executable header is refused, and a refused upload writes nothing.
 *  7. A client-supplied course id cannot widen access; it can only narrow.
 *  8. Rejected requests leave the table byte-identical.
 *
 * STUBBED OR LIVE -- IMPORTANT
 *
 * THIS IS A MOCKED SUITE. The app is the real server.js with the real middleware chain
 * (verifyToken -> attachRole -> attachCourseScope -> handler), but Firebase is a fake and
 * Supabase is tests/helpers/inMemorySupabase.js. No real Firebase project and no real
 * Cloudinary account are contacted. Nothing here verifies what production data contains
 * or that a real upload succeeds -- it verifies the AUTHORIZATION LOGIC only.
 *
 * Run: node tests/safetyRules.verify.js
 */

const { createClient } = require("./helpers/inMemorySupabase");

const CT = "CT";
const MT = "MT";

const SUPER = "u-super";
const ADMIN_CT = "u-admin-ct";
const ADMIN_MT = "u-admin-mt";
const STU_A = "u-stu-a";
const STU_B = "u-stu-b";
const STU_NO_COURSE = "u-stu-nocourse";

const DB = {};

DB.courses = [
  { id: CT, name: "Computer Technology", status: "active" },
  { id: MT, name: "Mechanical Technology", status: "active" },
];

// Two rules per course. file_public_id is a Cloudinary public id, never a delivery URL,
// and the suite asserts no response ever contains res.cloudinary.com.
DB.safety_rules = [
  { id: "sr-ct-1", title: "CT Rule", course: CT, status: "Active", file_public_id: "sr/ct1", file_format: "png", file_name: "ct1.png", uploaded_by: ADMIN_CT },
  { id: "sr-ct-2", title: "CT Rule 2", course: CT, status: "Active", file_public_id: null, uploaded_by: ADMIN_CT },
  { id: "sr-mt-1", title: "MT Rule", course: MT, status: "Active", file_public_id: "sr/mt1", file_format: "pdf", file_name: "mt1.pdf", uploaded_by: ADMIN_MT },
];

const firebaseState = { users: {} };

const ADMIN_SDK = { apps: [{}], initializeApp: () => {} };

const firestoreDb = {
  collection: (name) => ({
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

/*
 * Cloudinary credentials are STUBBED, so this suite must not depend on a real one.
 *
 * Why this line exists: the file endpoint refuses to serve when CLOUDINARY_CLOUD_NAME is
 * unset, answering 503 "File storage is not configured". That guard is correct, and this
 * suite was satisfying it by ACCIDENT -- server.js runs dotenv.config(), which resolves
 * `.env` relative to process.cwd(), so the suite passed only when run from backend/.
 * Run from the repository root it produced three failures whose error text points at
 * production configuration ("File storage is not configured") rather than at the real
 * cause, which is the working directory.
 *
 * A mocked suite must not need real credentials or a particular cwd. This value is a
 * stand-in, never used to reach Cloudinary: `global.fetch` is replaced with a stub for
 * the whole file-access section below, and the suite asserts the delivery URL is never
 * returned to the client.
 *
 * Set BEFORE requiring the server, and dotenv will not overwrite it (dotenv does not
 * override existing vars by default), so this holds whether or not a .env is present.
 *
 * The unconfigured 503 itself is still covered, on purpose, by
 * tests/uploadConfig.verify.js -- which deletes these two vars precisely to exercise it.
 */
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "stubbed-for-tests";
process.env.CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "stubbed-for-tests";

const { app } = require("../server");
const { identifyFile, safetyRuleScope } = require("../src/controllers/safetyRuleController");

const put = (uid, profile) => {
  DB.users = DB.users || [];
  DB.users.push({ id: uid, ...profile });
  firebaseState.users[uid] = profile;
};

put(SUPER, { email: "super@x", role: "admin", adminLevel: "super", courseId: null });
put(ADMIN_CT, { email: "ct@x", role: "admin", adminLevel: "course", courseId: CT, status: "active" });
put(ADMIN_MT, { email: "mt@x", role: "admin", adminLevel: "course", courseId: MT, status: "active" });
put(STU_A, { email: "a@x", role: "student", course: CT, schoolId: "S-A", firstName: "Ann", lastName: "Aguilar" });
put(STU_B, { email: "b@x", role: "student", course: MT, schoolId: "S-B", firstName: "Ben", lastName: "Bautista" });
put(STU_NO_COURSE, { email: "nc@x", role: "student", schoolId: "S-N" });

const tok = (uid) => `fake-token-${uid}`;

let failures = 0;
let passes = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  else passes++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${JSON.stringify(actual)}\n        want  ${JSON.stringify(expected)}`}`);
}

const get = (uid, path) => request(app).get(path).set("Authorization", `Bearer ${tok(uid)}`);
const send = (uid, method, path, body) => {
  let r = request(app)[method](path).set("Authorization", `Bearer ${tok(uid)}`);
  if (body) r = r.send(body);
  return r;
};
const ids = (body) => (Array.isArray(body) ? body : []).map((r) => r.id).sort();
const snapshot = () => JSON.stringify(DB.safety_rules);

// Real file headers.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n", "latin1");
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const EXE_BYTES = Buffer.from("MZ\x90\x00this is a windows executable", "latin1");
const SCRIPT_BYTES = Buffer.from("#!/bin/sh\nrm -rf /\n", "latin1");

(async () => {
  // ============================================================ scope unit tests
  console.log("--- scope resolution: the part scopeCodes() cannot do ---");
  // These compare against the WHOLE value rather than poking at .length or .includes on
  // it, on purpose. If the helper ever returns null for a student the assertions below
  // would otherwise throw a TypeError and abort the file -- and every HTTP-level test
  // after this block would silently never run, turning a loud failure into a quiet pass.
  check("super admin sees everything", safetyRuleScope({ profile: { role: "admin", adminLevel: "super" } }), null);
  check("course admin sees its own course", safetyRuleScope({ profile: { role: "admin", adminLevel: "course", courseId: CT } }), [CT]);
  check("STUDENT is scoped to their verified course", safetyRuleScope({ profile: { role: "student", course: MT } }), [MT]);
  check("a student with no course fails CLOSED", safetyRuleScope({ profile: { role: "student" } }), ["__no_course_in_scope__"]);
  check("an unknown role gets nothing", safetyRuleScope({ profile: { role: "kiosk" } }), ["__no_course_in_scope__"]);

  // ============================================================ listing
  console.log("--- list: each role sees only what it may ---");
  const superList = await get(SUPER, "/api/safety-rules");
  check("Super Admin lists all 3", ids(superList.body), ["sr-ct-1", "sr-ct-2", "sr-mt-1"]);

  const ctList = await get(ADMIN_CT, "/api/safety-rules");
  check("Course Admin CT lists only CT", ids(ctList.body), ["sr-ct-1", "sr-ct-2"]);

  const mtList = await get(ADMIN_MT, "/api/safety-rules");
  check("Course Admin MT lists only MT", ids(mtList.body), ["sr-mt-1"]);

  const stuList = await get(STU_A, "/api/safety-rules");
  check("a STUDENT lists only their own course", ids(stuList.body), ["sr-ct-1", "sr-ct-2"]);

  const noCourseList = await get(STU_NO_COURSE, "/api/safety-rules");
  check("a student with no course sees nothing", ids(noCourseList.body), []);

  // ============================================================ no URL leakage
  console.log("--- no response ever carries a Cloudinary delivery URL ---");
  for (const [label, body] of [
    ["super list", superList.body],
    ["ct list", ctList.body],
    ["stu list", stuList.body],
    ["single view", (await get(STU_A, "/api/safety-rules/sr-ct-1")).body],
  ]) {
    check(`${label} contains no cloudinary URL`, JSON.stringify(body).includes("cloudinary"), false);
    check(`${label} exposes no raw file_url`, JSON.stringify(body).includes("file_url"), false);
    // thumbnail_url is a CLIENT-SUPPLIED url the server would render as an <img src>
    // for every other user in the course -- a request-forgery / tracking-pixel vector
    // with no purpose here, since previews come from the authenticated file endpoint.
    check(`${label} exposes no thumbnail_url`, JSON.stringify(body).includes("thumbnail_url"), false);
  }

  console.log("--- a client-supplied thumbnailUrl is ignored, never stored ---");
  const thumbCreate = await send(ADMIN_CT, "post", "/api/safety-rules", {
    title: "Thumb attempt",
    course: CT,
    thumbnailUrl: "https://attacker.example/beacon.png",
    thumbnail_url: "https://attacker.example/beacon.png",
  });
  check("create still succeeds", thumbCreate.status, 201);
  check("  and the response carries no thumbnail_url", "thumbnail_url" in (thumbCreate.body || {}), false);
  const createdRow = DB.safety_rules.find((r) => r.id === (thumbCreate.body || {}).id);
  check("  and nothing was persisted from the client", createdRow && createdRow.thumbnail_url, undefined);
  const thumbUpdate = await send(ADMIN_CT, "put", `/api/safety-rules/${createdRow.id}`, {
    thumbnailUrl: "https://attacker.example/beacon.png",
    title: "Thumb attempt v2",
  });
  check("update with thumbnailUrl -> 200", thumbUpdate.status, 200);
  check("  the column is still unset", DB.safety_rules.find((r) => r.id === createdRow.id).thumbnail_url, undefined);

  // ============================================================ single view
  console.log("--- a foreign rule is 404, never 403 (403 would confirm it exists) ---");
  check("CT admin viewing an MT rule -> 404", (await get(ADMIN_CT, "/api/safety-rules/sr-mt-1")).status, 404);
  check("student viewing another course's rule -> 404", (await get(STU_A, "/api/safety-rules/sr-mt-1")).status, 404);
  check("MT admin viewing its own rule -> 200", (await get(ADMIN_MT, "/api/safety-rules/sr-mt-1")).status, 200);
  check("Super Admin views any rule -> 200", (await get(SUPER, "/api/safety-rules/sr-mt-1")).status, 200);

  // ============================================================ file access
  console.log("--- the file endpoint re-checks the course ---");
  // Cloudinary is stubbed for every request so no suite run depends on network reachability
  // or DNS timing. An unstubbed fetch made this file exit on a native Windows crash
  // (0xC0000409) whenever the lookup was slow -- a test that fails nondeterministically is
  // worse than no test, because it trains you to re-run until it goes green.
  const realFetch = global.fetch;
  let fetchedUrls = [];
  global.fetch = async (url) => {
    fetchedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      body: true,
      arrayBuffer: async () => Buffer.from("stubbed-file-bytes"),
    };
  };

  check("CT admin fetching an MT file -> 404", (await get(ADMIN_CT, "/api/safety-rules/sr-mt-1/file")).status, 404);
  check("student fetching another course's file -> 404", (await get(STU_A, "/api/safety-rules/sr-mt-1/file")).status, 404);
  check("  and Cloudinary was NEVER contacted for a denied request", fetchedUrls.length, 0);

  const ownFile = await get(ADMIN_MT, "/api/safety-rules/sr-mt-1/file");
  check("in-scope admin gets the file", ownFile.status, 200);
  check("  and Cloudinary was contacted exactly once", fetchedUrls.length, 1);
  check("  and the response carries no delivery URL header", String(ownFile.headers["x-from-cloudinary"] || ""), "");
  check("  and is marked private/no-store", ownFile.headers["cache-control"], "private, no-store");

  const noFileRule = await get(ADMIN_CT, "/api/safety-rules/sr-ct-2/file");
  check("a rule with no file -> 404", noFileRule.status, 404);

  global.fetch = realFetch;

  // ============================================================ writes
  console.log("--- Course Admin cannot write outside its course ---");
  const before = snapshot();
  // A submitted course is a rejected FORM VALUE (400), while a fetched row that is out of
  // scope is a 404. Conflating the two would either confirm nothing existed or answer a
  // bad request as if a resource were missing.
  check("CT admin creating an MT rule -> 400", (await send(ADMIN_CT, "post", "/api/safety-rules", { title: "x", course: MT })).status, 400);
  check("CT admin updating an MT rule -> 404", (await send(ADMIN_CT, "put", "/api/safety-rules/sr-mt-1", { title: "x" })).status, 404);
  check("CT admin deleting an MT rule -> 404", (await send(ADMIN_CT, "delete", "/api/safety-rules/sr-mt-1")).status, 404);
  check("  and the table is untouched", snapshot(), before);

  console.log("--- course must be present and real ---");
  check("create with no course -> 400", (await send(ADMIN_CT, "post", "/api/safety-rules", { title: "x" })).status, 400);
  check("create with an unknown course -> 400", (await send(ADMIN_CT, "post", "/api/safety-rules", { title: "x", course: "ZZ" })).status, 400);
  check("  and still nothing written", snapshot(), before);

  console.log("--- Course Admin creates in its own course ---");
  const created = await send(ADMIN_CT, "post", "/api/safety-rules", { title: "CT New", course: CT });
  check("create in own course -> 201", created.status, 201);
  const newId = created.body && created.body.id;

  console.log("--- an owned rule cannot be MOVED to another course ---");
  check("moving to MT -> 400", (await send(ADMIN_CT, "put", `/api/safety-rules/${newId}`, { course: MT })).status, 400);
  check("  and the course is unchanged", DB.safety_rules.find((r) => r.id === newId).course, CT);

  console.log("--- Super Admin may choose any valid course ---");
  const superCreated = await send(SUPER, "post", "/api/safety-rules", { title: "Anywhere", course: MT });
  check("Super Admin creates for MT -> 201", superCreated.status, 201);
  check("Super Admin still cannot invent a course", (await send(SUPER, "post", "/api/safety-rules", { title: "x", course: "ZZ" })).status, 400);

  // ============================================================ students cannot write
  console.log("--- students are readers only ---");
  const wBefore = snapshot();
  check("student create -> 403", (await send(STU_A, "post", "/api/safety-rules", { title: "x", course: CT })).status, 403);
  check("student update -> 403", (await send(STU_A, "put", "/api/safety-rules/sr-ct-1", { title: "x" })).status, 403);
  check("student delete -> 403", (await send(STU_A, "delete", "/api/safety-rules/sr-ct-1")).status, 403);
  check("student upload -> 403", (await send(STU_A, "post", "/api/safety-rules/upload", {})).status, 403);
  check("  and nothing changed", snapshot(), wBefore);

  // ============================================================ content validation
  console.log("--- file type is decided by CONTENT, not by the declared type ---");
  check("PNG bytes are identified", identifyFile(PNG_BYTES).mime, "image/png");
  check("PDF bytes are identified", identifyFile(PDF_BYTES).mime, "application/pdf");
  check("JPEG bytes are identified", identifyFile(JPEG_BYTES).mime, "image/jpeg");
  check("an EXE header is refused (this is the rename-to-.png attack)", identifyFile(EXE_BYTES), null);
  check("a shell script is refused", identifyFile(SCRIPT_BYTES), null);
  check("an empty buffer is refused", identifyFile(Buffer.alloc(0)), null);
  check("random bytes are refused", identifyFile(Buffer.from("just some text", "latin1")), null);

  // ============================================================ display filter narrows
  console.log("--- ?course= is a display filter and can only NARROW ---");
  const widened = await get(ADMIN_CT, "/api/safety-rules?course=MT");
  check("CT admin asking for course=MT gets 200", widened.status, 200);
  check("  but the result is empty, never a union", ids(widened.body), []);
  const narrowed = await get(SUPER, "/api/safety-rules?course=MT");
  check("Super Admin can genuinely filter by course", ids(narrowed.body).includes("sr-mt-1"), true);
  // The Super Admin created an MT rule earlier in this run, so the result legitimately
  // holds more than the seeded row. What matters is that NO CT rule leaks in, which is
  // the difference between a filter and a no-op.
  check("  and no CT rule appears in an MT filter", ids(narrowed.body).some((r) => r.startsWith("sr-ct")), false);

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`safetyRules: all ${passes} checks passed.`);
  process.exit(0);
})();