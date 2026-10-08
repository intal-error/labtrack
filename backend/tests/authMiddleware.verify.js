// Pins the auth middleware contract, specifically the failure this refactor caused.
//
// THE BUG THIS EXISTS FOR:
//
//   authController.register() calls auth.setCustomUserClaims(uid, { role }), and
//   auth.verifyIdToken() merges custom claims into the decoded token. So
//   req.user.role is ALREADY set for any account created through this app.
//
//   The first version of this refactor guarded BOTH the profile lookup and the role
//   assignment on `if (!req.user.role)`. For exactly those accounts the guard was
//   false, resolveProfile never ran, and req.profile stayed undefined -- so every
//   controller reading req.profile broke: students could not view attendance, file
//   incident reports or submit borrow requests, and the incident review workflow
//   403'd for every admin.
//
//   It was invisible to the other suites because they inject req.profile into each
//   request by hand rather than running the middleware. These cases go through the
//   real middleware with a real claim, which is the only way to catch it.
//
// Run: node tests/authMiddleware.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";
process.env.FIREBASE_PROJECT_ID = "placeholder";
process.env.FIREBASE_CLIENT_EMAIL = "a@example.co";
process.env.FIREBASE_PRIVATE_KEY = "placeholder";

const firebasePath = require.resolve("../src/config/firebase");

const USERS = {
  // A student, with the custom claim a real token carries.
  stu1: { id: "stu1", role: "student", firstName: "Ana", lastName: "Reyes", schoolId: "23-000039", course: "BIT", status: "active" },
  // A course handler: assignedCourses present, so NOT a super-admin.
  hBit: { id: "hBit", role: "admin", firstName: "Cara", lastName: "Lim", assignedCourses: ["BIT"], status: "active" },
  // A super-admin: role admin, no assignedCourses.
  root: { id: "root", role: "admin", firstName: "Eve", lastName: "Santos", assignedCourses: [], status: "active" },
};

// Token claims, exactly as verifyIdToken returns them: uid + the custom role.
const tokenFor = (id) => ({ uid: id, role: USERS[id].role });

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    admin: { firestore: () => ({ FieldPath: { documentId: () => "__name__" } }) },
    db: {
      collection: (name) => ({
        doc: (id) => ({
          get: async () => {
            const doc = name === "users" ? USERS[id] : null;
            return doc ? { exists: true, id, data: () => doc } : { exists: false, id, data: () => undefined };
          },
        }),
        where: () => ({ get: async () => ({ docs: [] }) }),
      }),
    },
    auth: {},
  },
};

const { attachRole, authorize } = require("../src/middleware/auth");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want  ${e}`}`);
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

async function run(mw, req) {
  const res = makeRes();
  let nexted = false;
  await mw(req, res, () => { nexted = true; });
  return { req, res, nexted };
}

(async () => {
  console.log("--- THE REGRESSION: a token that already carries a role claim ---");
  // This is the shape every app-registered account has.
  for (const id of ["stu1", "hBit", "root"]) {
    const { req, nexted } = await run(attachRole, { user: tokenFor(id) });
    check(`${id}: attachRole passes through`, nexted, true);
    check(`${id}: req.profile is POPULATED despite the claim`, Boolean(req.profile), true);
    check(`${id}: req.profile.id`, req.profile && req.profile.id, id);
    check(`${id}: req.profile.schoolId survives`, id === "stu1" ? req.profile.schoolId : "n/a", id === "stu1" ? "23-000039" : "n/a");
    check(`${id}: assignedCourses survive`, id === "root" ? req.profile.assignedCourses : "n/a", id === "root" ? [] : "n/a");
  }

  console.log("--- the claim still wins for authorization (no new privilege path) ---");
  // A token claiming admin must still authorize as admin, exactly as before.
  {
    const { req, nexted } = await run(authorize("admin"), { user: tokenFor("hBit") });
    check("admin claim passes authorize('admin')", nexted, true);
    check("req.user.role is unchanged", req.user.role, "admin");
  }
  {
    const { nexted, res } = await run(authorize("admin"), { user: tokenFor("stu1") });
    check("student claim is REFUSED by authorize('admin')", nexted, false);
    check("  with 403", res.statusCode, 403);
  }
  {
    // No claim at all: the profile supplies the role, as it always did.
    const { req, nexted } = await run(authorize("admin"), { user: { uid: "hBit" } });
    check("no claim: role comes from the profile", nexted, true);
    check("no claim: req.user.role populated", req.user.role, "admin");
  }

  console.log("--- a uid in neither collection ---");
  {
    const { req, nexted, res } = await run(attachRole, { user: { uid: "ghost" } });
    check("unknown uid still calls next()", nexted, true);
    check("unknown uid: req.profile is null", req.profile, null);
    check("unknown uid: req.user.role is null", req.user.role, null);
    check("  and authorize() then 403s", (await run(authorize("admin"), { user: { uid: "ghost" } })).res.statusCode, 403);
    void res;
  }

  console.log("--- an admins-collection document is forced to role:admin ---");
  {
    // `admins` docs are written without a role field. If one ever carried a stale
    // role, it must NOT override the forced value.
    const firebase = require(firebasePath);
    const originalCollection = firebase.db.collection;
    firebase.db.collection = (name) =>
      name === "admins"
        ? { doc: (id) => ({ get: async () => ({ exists: true, id, data: () => ({ firstName: "Legacy", role: "student" }) }) }) }
        : originalCollection(name);

    // Fresh module instance so the require-time stub is re-evaluated.
    delete require.cache[require.resolve("../src/middleware/auth")];
    const { attachRole: fresh } = require("../src/middleware/auth");
    const { req } = await run(fresh, { user: { uid: "legacy-admin" } });
    check("a stored role on an admins doc cannot demote the owner", req.profile.role, "admin");
    check("  other fields still present", req.profile.firstName, "Legacy");

    firebase.db.collection = originalCollection;
  }

  console.log("--- one read per request, and only one ---");
  {
    const firebase = require(firebasePath);
    let reads = 0;
    const originalCollection = firebase.db.collection;
    firebase.db.collection = (name) => ({
      doc: (id) => ({
        get: async () => {
          reads += 1;
          const doc = name === "users" ? USERS[id] : null;
          return doc ? { exists: true, id, data: () => doc } : { exists: false, id, data: () => undefined };
        },
      }),
      where: () => ({ get: async () => ({ docs: [] }) }),
    });

    delete require.cache[require.resolve("../src/middleware/auth")];
    const fresh = require("../src/middleware/auth");
    const req = { user: tokenFor("stu1") };
    await run(fresh.attachRole, req);
    const afterFirst = reads;
    await run(fresh.authorize("student"), req);
    check("attachRole resolves once for a users doc", afterFirst, 1);
    check("a later authorize on the same req does NOT re-read", reads, afterFirst);

    firebase.db.collection = originalCollection;
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();