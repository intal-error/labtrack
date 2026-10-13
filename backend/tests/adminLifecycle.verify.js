/**
 * The Super Admin -> Course Admin account lifecycle: create, deactivate, reactivate,
 * delete, and the guarantees that were silently missing between them.
 *
 * WHY THIS FILE IS SEPARATE FROM superAdmin.verify.js
 * ----------------------------------------------------
 * superAdmin.verify.js asserts REFUSALS -- that the Super Admin account itself cannot
 * be demoted, deactivated or deleted, and that reassignment is Super-Admin-only. Those
 * are all about who may act. This file asserts the CONSEQUENCES of a successful action:
 * that deactivating an admin actually revokes access, that reactivating actually
 * restores it, that the two Firestore collections never drift apart, and that a partial
 * failure of the Auth/Firestore pair leaves neither store lying about the other.
 *
 * THE THREE BUGS THIS EXISTS TO PIN
 * ---------------------------------
 *  1. Deactivate did not revoke anything. toggleStatus() wrote only
 *     `users/{uid}.status`. The single `auth.updateUser(id, {disabled: true})` in the
 *     whole file lived in remove() (the DELETE handler). So the "Deactivate" button in
 *     the UI left a Course Admin fully able to sign in and fully able to pass
 *     authorize("admin") on every admin surface, because authorize() reads the
 *     `{role: "admin"}` custom claim set once at creation -- a claim Firestore status
 *     does not touch.
 *
 *  2. Reactivate could not undo it. Once remove() had disabled the Auth record,
 *     toggleStatus() had no code path that ever passed `disabled: false`. Delete then
 *     Activate left Firestore saying "active" and Auth saying "disabled": the roster
 *     showed a healthy account that could never sign in again, repairable only with CLI
 *     access to the host.
 *
 *  3. A partial failure corrupted the pair. remove() swallowed every error
 *     (`try { ... } catch {}`), so a failed Auth write produced a confident HTTP 200 and
 *     a "Admin deactivated" message for a deactivation that had not happened.
 *
 * The tests below assert the RECORDED side effects (state.authCalls, state.users,
 * state.admins) rather than the response body, because a handler can return 200 while
 * having written nothing -- which is exactly bug 3.
 *
 * SOFT DELETE IS INTENTIONAL AND PINNED HERE. `DELETE /api/admin/:id` must KEEP both
 * rows. incidentController.js:548 and borrowRequestController.js:498 look admins up by
 * uid and read status === "inactive" to refuse handing them new work; deleting the row
 * would orphan that history and turn a "cannot assign to inactive admin" refusal into a
 * crash. So "delete" here means "deactivate and revoke", and that is what is asserted.
 *
 * Run: node tests/adminLifecycle.verify.js
 */

// ── Stubs ────────────────────────────────────────────────────────────────────

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const ROSTER = {
  root: { role: "admin", adminLevel: "super", courseId: null, firstName: "Eve", lastName: "Santos", email: "eve@slsu.edu.ph", status: "active" },
  ctAdmin: { role: "admin", adminLevel: "course", courseId: "CT", firstName: "Cara", lastName: "Lim", email: "cara@slsu.edu.ph", status: "active" },
  mtAdmin: { role: "admin", adminLevel: "course", courseId: "MT", firstName: "Dan", lastName: "Ocho", email: "dan@slsu.edu.ph", status: "active" },
  // Pre-migration: no adminLevel field at all, but a real assigned course.
  legacy: { role: "admin", assignedCourses: ["BIT"], firstName: "Fay", lastName: "Reyes", email: "fay@slsu.edu.ph", status: "active" },
  // Pre-migration: no adminLevel AND no courses. Under the inference courseScope.js
  // deleted, this is an incomplete record, not a Super Admin. It must fail closed.
  legacyRoot: { role: "admin", assignedCourses: [], firstName: "Gil", lastName: "Reyes", email: "gil@slsu.edu.ph", status: "active" },
};

const COURSES = ["BIT", "CT", "CPT", "AT", "CTV", "ELT", "ELX", "FSM", "MT"];

const state = { users: {}, admins: {}, authCalls: [], claims: [], nextUid: 0 };

/** Failure injection for the two-write rollback assertions. */
const boom = { auth: false, firestore: false };

function resetState() {
  state.users = {};
  state.admins = {};
  state.authCalls = [];
  state.claims = [];
  state.nextUid = 0;
  boom.auth = false;
  boom.firestore = false;
  Object.entries(ROSTER).forEach(([uid, row]) => {
    state.users[uid] = { ...row };
    state.admins[uid] = { ...row };
  });
}

/** The Auth-side truth, reconstructed from the recorded updateUser calls. */
function authDisabled(uid) {
  const calls = state.authCalls.filter((c) => c.uid === uid && c.disabled !== undefined);
  return calls.length ? calls[calls.length - 1].disabled : false;
}

function matchCond(row, [field, op, value]) {
  if (op === "==") return row[field] === value;
  throw new Error(`stub does not implement ${op}`);
}

/**
 * A QuerySnapshot stand-in. `docs` must be document-shaped, not bare rows:
 * adminController reads them two different ways -- getAll() goes through .forEach()
 * and calls doc.data(), while getActiveAdmins() goes through .docs.map(doc => ...)
 * and ALSO calls doc.data(). Handing back plain objects made the latter throw
 * "doc.data is not a function" and land in the catch block as a 500, which looked
 * like a product failure but was the stub's.
 */
function snapshot(rows) {
  const docs = rows.map((row) => ({ id: row.id, data: () => row }));
  const snap = { size: docs.length, docs, empty: docs.length === 0 };
  snap.forEach = (fn) => docs.forEach((doc, i) => fn(doc, i));
  return snap;
}

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
              if (boom.firestore) throw new Error("INJECTED firestore write failure");
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
    const uid = `new-${state.nextUid++}`;
    state.authCalls.push({ kind: "createUser", uid, email });
    return { uid };
  },
  async setCustomUserClaims(uid, claims) {
    state.claims.push({ uid, claims });
  },
  async updateUser(uid, patch) {
    // Record the ATTEMPT before throwing, so a test can assert that a failed revoke
    // really was attempted rather than skipped.
    state.authCalls.push({ kind: "updateUser", uid, ...patch });
    if (boom.auth) throw new Error("INJECTED auth update failure");
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
stub("../src/utils/adminScope", { invalidateAdminsCache: () => {} });

const controller = require("../src/controllers/adminController");

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

async function call(handler, req) {
  const res = mockRes();
  await handler({ ...req, params: req.params || {} }, res);
  return { status: res.statusCode, body: res.payload };
}

const asUser = (uid) => ({ user: { uid }, profile: state.users[uid] });

/** Fields that must never diverge between the authoritative row and the mirror. */
const mirrorKeys = ["status", "adminLevel", "courseId"];
const mirrorOf = (uid) => mirrorKeys.map((k) => [state.users[uid][k], state.admins[uid] && state.admins[uid][k]]);

const VALID_NEW_ADMIN = {
  firstName: "New",
  lastName: "Admin",
  email: "new.admin@slsu.edu.ph",
  password: "Passw0rd!",
};

// ── Tests ────────────────────────────────────────────────────────────────────

(async () => {
  resetState();

  console.log("--- create(): the account is usable the moment it is returned ---");
  {
    const res = await call(controller.create, {
      ...asUser("root"),
      body: { ...VALID_NEW_ADMIN, courseId: "CT", adminLevel: "course" },
    });
    check("created", res.status, 201);
    const uid = res.body.id;
    check("users row carries the course assignment", [state.users[uid].adminLevel, state.users[uid].courseId], ["course", "CT"]);
    check("users row carries role for authorize()", state.users[uid].role, "admin");
    check("users row starts active", state.users[uid].status, "active");
    check("the mirror agrees with the authoritative row", mirrorOf(uid).every((p) => p[0] === p[1]), true);
    check("only { role } is claimed", state.claims[0].claims, { role: "admin" });
    // BUG 1 ADJACENT: an admin must never be created already-disabled. There is no
    // `disabled` field on the Firestore row, so "created" and "active" must agree.
    check("a new admin is not disabled in Auth", authDisabled(uid), false);
  }

  console.log("--- BUG 1: deactivate must REVOKE, not just relabel ---");
  {
    resetState();
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("super admin deactivating a Course Admin", res.status, 200);
    check("Firestore marks them inactive", state.users.ctAdmin.status, "inactive");
    check("the mirror follows", state.admins.ctAdmin.status, "inactive");
    check("the two stores agree", mirrorOf("ctAdmin").every((p) => p[0] === p[1]), true);
    // THE ASSERTION THAT FAILS WITHOUT THE FIX.
    check("Firebase Auth is DISABLED, so the token stops working", authDisabled("ctAdmin"), true);
  }
  {
    // The same rule for the other direction. Today nothing ever sends disabled:false,
    // so once any account has been disabled there is no way back through this endpoint.
    resetState();
    state.users.mtAdmin.status = "inactive";
    state.admins.mtAdmin.status = "inactive";
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "mtAdmin" } });
    check("super admin reactivating a Course Admin", res.status, 200);
    check("Firestore marks them active", state.users.mtAdmin.status, "active");
    check("Firebase Auth is RE-ENABLED, so they can sign in again", authDisabled("mtAdmin"), false);
  }

  console.log("--- BUG 2: the delete -> activate round trip ---");
  {
    resetState();
    const del = await call(controller.remove, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("delete", del.status, 200);
    check("  Firestore inactive", state.users.ctAdmin.status, "inactive");
    check("  Auth disabled", authDisabled("ctAdmin"), true);

    const act = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("reactivate", act.status, 200);
    check("  Firestore active again", state.users.ctAdmin.status, "active");
    check("  Auth ENABLED again -- the account is not bricked", authDisabled("ctAdmin"), false);
    check("  and the mirror agrees", mirrorOf("ctAdmin").every((p) => p[0] === p[1]), true);
  }

  console.log("--- SOFT DELETE: the rows survive, on purpose ---");
  {
    resetState();
    await call(controller.remove, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("users row is NOT deleted (incident history references it)", state.users.ctAdmin !== undefined, true);
    check("admins mirror is NOT deleted", state.admins.ctAdmin !== undefined, true);
    check("  and it still records who they were", state.users.ctAdmin.email, "cara@slsu.edu.ph");
    check("  and which course they handled", state.users.ctAdmin.courseId, "CT");
  }

  console.log("--- BUG 3: a partial failure must not report success ---");
  {
    // Auth fails: nothing may be written, so the two stores cannot disagree.
    resetState();
    boom.auth = true;
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("deactivate reports the failure (not 200)", res.status >= 400, true);
    check("  Firestore is untouched", state.users.ctAdmin.status, "active");
    check("  so the roster does not show an active account that lost its login", mirrorOf("ctAdmin").every((p) => p[0] === p[1]), true);
  }
  {
    // Auth succeeds, Firestore fails: the Auth write must be ROLLED BACK, or the
    // account is locked out while the roster insists it is Active -- the exact
    // permanent lockout this change exists to make impossible.
    resetState();
    boom.firestore = true;
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("deactivate reports the failure (not 200)", res.status >= 400, true);
    check("  the Auth disable is ROLLED BACK", authDisabled("ctAdmin"), false);
    check("  so the admin can still sign in", state.users.ctAdmin.status, "active");
  }
  {
    // Same contract for reactivate, mirrored: if Firestore fails the re-enable must
    // be undone too, otherwise the roster shows "inactive" for an account that is
    // still logged in and still holding a valid token.
    resetState();
    state.users.ctAdmin.status = "inactive";
    state.admins.ctAdmin.status = "inactive";
    await call(controller.remove, { ...asUser("root"), params: { id: "mtAdmin" } }); // mAdmin gets disabled
    boom.firestore = true;
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "mtAdmin" } });
    check("reactivate reports the failure (not 200)", res.status >= 400, true);
    check("  Firestore still inactive", state.users.mtAdmin.status, "inactive");
    check("  Auth still disabled", authDisabled("mtAdmin"), true);
  }
  {
    // delete() must obey the same contract. Today it swallows the Auth error entirely.
    resetState();
    boom.auth = true;
    const res = await call(controller.remove, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("delete reports an Auth failure (not 200)", res.status >= 400, true);
    check("  Firestore is untouched", state.users.ctAdmin.status, "active");
  }

  console.log("--- a Course Admin cannot deactivate or delete anyone ---");
  {
    resetState();
    const peer = await call(controller.toggleStatus, { ...asUser("ctAdmin"), params: { id: "mtAdmin" } });
    check("deactivating a peer is refused", peer.status, 403);
    check("  and nothing was written to Auth", state.authCalls, []);
    check("  and nothing was written to Firestore", state.users.mtAdmin.status, "active");

    const del = await call(controller.remove, { ...asUser("ctAdmin"), params: { id: "mtAdmin" } });
    check("deleting a peer is refused", del.status, 403);
    check("  and nothing was written to Auth", state.authCalls, []);
  }
  {
    resetState();
    const peer = await call(controller.toggleStatus, { ...asUser("ctAdmin"), params: { id: "root" } });
    check("deactivating the Super Admin is refused", peer.status, 403);
    const del = await call(controller.remove, { ...asUser("ctAdmin"), params: { id: "root" } });
    check("deleting the Super Admin is refused", del.status, 403);
    check("  the Super Admin is untouched", [state.users.root.status, state.users.root.adminLevel], ["active", "super"]);
    check("  and nothing was written to Auth", state.authCalls, []);
  }
  {
    resetState();
    const self = await call(controller.toggleStatus, { ...asUser("ctAdmin"), params: { id: "ctAdmin" } });
    check("self-deactivation is refused", self.status, 400);
    check("  and nothing was written to Auth", state.authCalls, []);
  }

  console.log("--- the last active admin is protected ---");
  {
    // Reachable only when the TARGET is the sole active admin, because the guard only
    // runs when the flip is heading to "inactive". That needs the Super Admin's own
    // record to be inactive out-of-band (scripts/set-super-admin.js writes the Auth
    // record and the Firestore row as two separate steps, and its rollback path at
    // lines 732-761 can leave them momentarily disagreeing). Called here at the
    // handler level, which is what a real request looks like before the status gate
    // is added in middleware/auth.js.
    resetState();
    state.users.root.status = "inactive";
    state.users.mtAdmin.status = "inactive";
    state.users.legacy.status = "inactive";
    state.users.legacyRoot.status = "inactive";
    check("precondition: one active admin remains", [state.users.ctAdmin.status], ["active"]);

    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("deactivating the last remaining Course Admin is refused", res.status, 400);
    check("  and they are still active", state.users.ctAdmin.status, "active");
    const del = await call(controller.remove, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("deleting them is refused too", del.status, 400);
    check("  and they are still active", state.users.ctAdmin.status, "active");
  }
  {
    // Positive control: with the Super Admin also active, size is 2 and the guard
    // must NOT fire, or the Super Admin could never remove a single Course Admin.
    resetState();
    const res = await call(controller.toggleStatus, { ...asUser("root"), params: { id: "ctAdmin" } });
    check("with the Super Admin still active, deactivating one is allowed", res.status, 200);
  }

  console.log("--- BUG 4: the roster fails closed for an incomplete admin record ---");
  {
    resetState();
    const course = await call(controller.getAll, asUser("ctAdmin"));
    check("a Course Admin sees only themselves", course.body.map((a) => a.id), ["ctAdmin"]);

    // No adminLevel at all. Under the inference courseScope.js deliberately removed,
    // this is an incomplete record, not an appointment -- so it must not be handed the
    // whole roster (every other admin's name, email and contact number).
    const legacy = await call(controller.getAll, asUser("legacy"));
    check("a legacy admin with NO adminLevel does NOT get the roster", legacy.body.map((a) => a.id), ["legacy"]);

    const legacyRoot = await call(controller.getAll, asUser("legacyRoot"));
    check("a course-less admin with NO adminLevel does NOT get the roster", legacyRoot.body.map((a) => a.id), ["legacyRoot"]);

    const legacyActive = await call(controller.getActiveAdmins, asUser("legacy"));
    check("  nor the active-admin picker", legacyActive.body.map((a) => a.id), ["legacy"]);

    const superRoster = await call(controller.getAll, asUser("root"));
    check("POSITIVE CONTROL: the Super Admin still sees everyone", superRoster.body.map((a) => a.id).sort(), ["ctAdmin", "legacy", "legacyRoot", "mtAdmin", "root"]);
  }

  console.log("--- mirror consistency after a reassignment ---");
  {
    resetState();
    const res = await call(controller.update, {
      ...asUser("root"),
      params: { id: "ctAdmin" },
      body: { firstName: "Cara", lastName: "Lim", courseId: "MT" },
    });
    check("the Super Admin can reassign", res.status, 200);
    check("  authoritative row follows", state.users.ctAdmin.courseId, "MT");
    check("  mirror follows", state.admins.ctAdmin.courseId, "MT");
    check("  and the two agree", mirrorOf("ctAdmin").every((p) => p[0] === p[1]), true);
    // A reassignment is not an activation: it must not silently re-enable an account
    // the Super Admin deactivated.
    check("  reassignment does not touch the Auth record", state.authCalls, []);
  }

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("adminLifecycle: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});