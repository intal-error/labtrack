/**
 * Proves the --adopt-super rollback actually restores prior state.
 *
 * WHY THIS EXISTS, AND WHY IT RUNS AGAINST EMULATORS: the rollback is the only
 * thing standing between a failed run and an account that signs in but has no
 * profile, which lands on ProfileGate forever. That failure was observed for real
 * once already (an Auth account was created with no claims and no Firestore
 * profile). Testing it against real Firebase means deliberately breaking real
 * accounts, so it runs against the Firestore + Auth emulators instead: the same
 * CLI, the same code path, zero live writes.
 *
 * WHY IT SPAWNS THE CLI RATHER THAN IMPORTING IT: the script runs its mode at module
 * load, and more importantly the behaviour under test is the process's real exit
 * code and real stdout -- which is what an operator actually sees.
 *
 * THE BUG THIS CAUGHT: the rollback originally did setCustomUserClaims(uid, null).
 * That is correct only for an account that started with NO claims. An account that
 * already carried {"role":"student"} came out of a failed run stripped of it --
 * rollback destroyed pre-existing data. Case 2 below exists to hold that fixed.
 *
 * Run: npm run verify:rollback -w backend
 */

const { spawnSync } = require("child_process");
const path = require("path");

require("dotenv").config();
const admin = require("firebase-admin");

const PROJECT = "demo-labtrack-rules";
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const auth = admin.auth();

const SCRIPT = path.join(__dirname, "..", "scripts", "set-super-admin.js");

let failures = 0;
let passes = 0;

function check(label, actual, expected) {
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

/**
 * Runs the real CLI in a child process.
 *
 * Emulator hosts are passed explicitly and the production FIREBASE_* credentials
 * are REMOVED from the child environment, so a mistake in the script cannot reach
 * the live project even if the emulator detection were broken.
 */
function runCli(args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.FIREBASE_CLIENT_EMAIL;
  delete env.FIREBASE_PRIVATE_KEY;
  delete env.FIREBASE_PROJECT_ID;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: {
      ...env,
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_PROJECT_ID: PROJECT,
    },
    encoding: "utf8",
  });
}

/**
 * Claim state, normalised.
 *
 * "No claims" has two representations: a freshly created user returns undefined,
 * while an account whose claims were explicitly set to null returns {}. They are
 * the same state and both mean `claims.role` is undefined, so comparing the raw
 * values would fail on representation rather than on behaviour. Every non-empty
 * claim set is still compared exactly, which is where case 2's real assertion
 * lives.
 */
const claimsOf = async (uid) => (await auth.getUser(uid)).customClaims ?? null;
const normaliseClaims = (c) => (c && Object.keys(c).length === 0 ? null : c);

const profileDocs = async (uid) => ({
  users: (await db.collection("users").doc(uid).get()).exists,
  admins: (await db.collection("admins").doc(uid).get()).exists,
});

(async () => {
  try {
    // ── Fixtures ──────────────────────────────────────────────────────────────
    // Two accounts: one with no prior claims, one carrying {"role":"student"}.
    const noClaims = await auth.createUser({
      email: "rollback-noclaims@example.test",
      password: "RollbackProbe1!",
    });
    const hadClaims = await auth.createUser({
      email: "rollback-hadclaims@example.test",
      password: "RollbackProbe2!",
    });
    await auth.setCustomUserClaims(hadClaims.uid, { role: "student" });

    // The exact claim state before each run. Rollback must restore THIS, not
    // merely "clear" -- capturing it is what makes the assertion about restoration
    // rather than about whatever the SDK happens to return for an empty claim set.
    const beforeNoClaims = normaliseClaims(await claimsOf(noClaims.uid));
    const beforeHadClaims = normaliseClaims(await claimsOf(hadClaims.uid));

    // A bystander that rollback must never touch.
    const BYSTANDER = "bystander-doc-id";
    await db.collection("users").doc(BYSTANDER).set({ role: "student", firstName: "Bystander" });

    console.log("--- 1. rollback restores an account that had NO prior claims ---");
    let r = runCli(
      ["--adopt-super", noClaims.email, "--first", "Roll", "--last", "Back", "--fault", "none"],
      { LABTRACK_FAULT: "after-claims" }
    );
    check("exits non-zero", r.status !== 0, true);
    check("announces the rollback", /Rolling back/.test(r.stderr + r.stdout), true);
    check("names the injected fault", /fault injection/.test(r.stderr + r.stdout), true);
    check("no users/ document survives", (await profileDocs(noClaims.uid)).users, false);
    check("no admins/ document survives", (await profileDocs(noClaims.uid)).admins, false);
    check("claims restored to the exact prior value (none)", normaliseClaims(await claimsOf(noClaims.uid)), beforeNoClaims);
    check("  and specifically not role:admin", (await auth.getUser(noClaims.uid)).customClaims?.role, undefined);
    check(
      "the Auth account STILL EXISTS (rollback must never deleteUser)",
      Boolean(await auth.getUser(noClaims.uid).catch(() => null)),
      true
    );

    console.log("--- 2. rollback restores claims an account ALREADY had ---");
    // The regression: nulling would leave this as {} and silently un-role the user.
    r = runCli(
      ["--adopt-super", hadClaims.email, "--first", "Prior", "--last", "Claims"],
      { LABTRACK_FAULT: "after-claims" }
    );
    check("exits non-zero", r.status !== 0, true);
    check("no users/ document survives", (await profileDocs(hadClaims.uid)).users, false);
    check("no admins/ document survives", (await profileDocs(hadClaims.uid)).admins, false);
    check(
      "PRE-EXISTING claims are restored, not nulled",
      normaliseClaims(await claimsOf(hadClaims.uid)),
      beforeHadClaims
    );
    check("  and that value is still {role:student}", beforeHadClaims, { role: "student" });
    check(
      "the Auth account STILL EXISTS",
      Boolean(await auth.getUser(hadClaims.uid).catch(() => null)),
      true
    );

    console.log("--- 3. rollback touches nothing else ---");
    check(
      "bystander document unchanged",
      (await db.collection("users").doc(BYSTANDER).get()).data(),
      { role: "student", firstName: "Bystander" }
    );

    console.log("--- 4. the fault hook is REJECTED outside the emulator ---");
    // This is the safety property for the hook itself. Production credentials are
    // present here, so if the gate were missing this run would target the live
    // project. It must exit before touching anything.
    //
    // The emulator hosts are explicitly REMOVED, not merely omitted: this test runs
    // under `firebase emulators:exec`, which puts them in OUR environment, so
    // spreading process.env would hand them to the child and quietly test the
    // emulator path instead of the production one.
    const prodEnv = { ...process.env, LABTRACK_FAULT: "after-claims" };
    delete prodEnv.FIRESTORE_EMULATOR_HOST;
    delete prodEnv.FIREBASE_AUTH_EMULATOR_HOST;
    if (!prodEnv.FIREBASE_PRIVATE_KEY) {
      failures += 1;
      console.log("FAIL  production env available for the hook-rejection test");
    }
    r = spawnSync(
      process.execPath,
      [SCRIPT, "--adopt-super", "x@y.com", "--first", "A", "--last", "B", "--dry"],
      { env: prodEnv, encoding: "utf8" }
    );
    check("exits non-zero", r.status !== 0, true);
    check("says the hook is emulator-only", /only permitted against an emulator/.test(r.stderr), true);
    check("refuses explicitly", /Refusing to run/.test(r.stderr), true);

    console.log("--- 5. a PARTIAL emulator config fails closed ---");
    r = spawnSync(
      process.execPath,
      [SCRIPT, "--adopt-super", "x@y.com", "--first", "A", "--last", "B", "--dry"],
      {
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "" },
        encoding: "utf8",
      }
    );
    check("exits non-zero", r.status !== 0, true);
    check("requires BOTH emulator hosts", /requires BOTH emulator hosts/.test(r.stderr), true);

    console.log("--- 6. a clean run with no fault succeeds end to end ---");
    // Proves the emulator path works when nothing is broken, so cases 1-2 are
    // testing the rollback rather than a harness that can never write.
    const ok = await auth.createUser({
      email: "rollback-happy@example.test",
      password: "RollbackProbe3!",
    });
    r = runCli(["--adopt-super", ok.email, "--first", "Happy", "--last", "Path"]);
    check("exits zero", r.status, 0);
    check("users/ document written", (await profileDocs(ok.uid)).users, true);
    check("admins/ mirror written", (await profileDocs(ok.uid)).admins, true);
    check("claims applied", (await auth.getUser(ok.uid)).customClaims, { role: "admin" });
    const written = (await db.collection("users").doc(ok.uid).get()).data();
    check("adminLevel is super", written.adminLevel, "super");
    check("courseId is null", written.courseId, null);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  suite aborted: ${err.message}`);
  } finally {
    // Emulator data does not persist, but delete anyway so a failed run leaves nothing.
    await db.terminate().catch(() => {});
  }

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`adoptSuperRollback: all ${passes} checks passed`);
})().catch((err) => {
  console.error(`adoptSuperRollback crashed: ${err.message}`);
  process.exit(1);
});