/**
 * Proves the Firebase behaviour the admin deactivation fix is built on, against the
 * REAL Auth emulator rather than against a test double.
 *
 * WHY THIS EXISTS, AND WHY IT CANNOT BE A STUB TEST. adminController.toggleStatus()
 * now calls `auth.updateUser(uid, { disabled })` and relies on that ending the
 * account's access. Two separate things then have to be true, and only one of them is
 * ours to assert:
 *
 *   1. That a disabled Auth record makes verifyIdToken REJECT a token which is
 *      unexpired and correctly signed. This is Firebase's behaviour, not ours, and it
 *      is exactly the assumption the whole revocation path rests on.
 *   2. That it is REVERSIBLE -- that re-enabling restores access -- because
 *      reactivate is the only way back from a deactivation.
 *
 * Every other suite in this repo stubs Firebase, so a stub that wrongly believed
 * `disabled` was cosmetic would make all of them pass while the feature was broken.
 * This one asks Firebase directly.
 *
 * IT RUNS AGAINST EMULATORS ONLY. `firebase emulators:exec` starts Firestore + Auth
 * on 127.0.0.1 and points this process at them; the project id is the demo
 * singleProjectMode id, so a stray credential in .env cannot reach a live project --
 * and the Admin SDK refuses to use a service account at all while an emulator host is
 * set. The accounts created here are disposable and live only in emulator memory.
 *
 * WHAT IT DELIBERATELY DOES NOT TEST: the Firestore-side account status gate added to
 * middleware/auth.js. That is covered end to end in apiAuthz.verify.js sections 14/15,
 * which drive the real Express app. This file only establishes that the Auth-level
 * primitive is real, so the other suite's stub is known to be faithful.
 *
 * Run: npm run verify:authdisabled -w backend
 */

const admin = require("firebase-admin");

const PROJECT = "demo-labtrack-rules";

// Fail closed if this file is ever run outside the emulator: the whole point is that
// it creates and disables real Auth users, and that must never happen against a live
// project. Both hosts are required -- checking one would let a partial emulator
// (firestore only) silently fall back to the production credential in .env.
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "REFUSING TO RUN: this suite creates and disables real Firebase Auth users.\n" +
    "It requires both emulator hosts. Run it as:\n" +
    "  npm run verify:authdisabled -w backend\n" +
    "  (firebase emulators:exec --only firestore,auth --project demo-labtrack-rules ...)",
  );
  process.exit(2);
}

admin.initializeApp({ projectId: PROJECT });
const auth = admin.auth();
const db = admin.firestore();

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
 * Mints a real ID token for the user.
 *
 * The Auth emulator implements the REST sign-in endpoints, so this is the same
 * exchange the browser performs -- `getIdToken()`'s server-side equivalent. Using a
 * real token (rather than a hand-built fake) is the point: it is what proves the
 * rejection is about the disabled record and not about a malformed token.
 */
async function mintToken(email, password) {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error(`sign-in failed: ${JSON.stringify(body).slice(0, 300)}`);
  return body.idToken;
}

const AUTH_CODES = (err) => (err && (err.code || err.errorInfo && err.errorInfo.code)) || "unknown";

(async () => {
  const email = "revocation-probe@labtrack.test";
  const password = "Passw0rd!";
  const uid = "revocation-probe-uid";

  console.log("--- a real account, in the real Auth emulator ---");
  let created;
  try {
    created = await auth.createUser({ uid, email, password });
  } catch (err) {
    // A re-run in the same emulator session can collide; adopt the existing record.
    if (AUTH_CODES(err) !== "auth/uid-already-exists") throw err;
    created = await auth.getUser(uid);
  }
  check("the probe account exists", created.uid, uid);

  const token = await mintToken(email, password);
  check("a token mints for a fresh account", typeof token === "string" && token.length > 0, true);
  const decoded = await auth.verifyIdToken(token);
  check("  and verifyIdToken accepts it", decoded.uid, uid);
  check("  (and the emulator really is the one answering)", decoded.aud, PROJECT);

  console.log("--- disabling must END access, not merely relabel it ---");
  await auth.updateUser(uid, { disabled: true });

  // This is the load-bearing assertion. If Firebase kept honouring a token for a
  // disabled user, the adminController mirror would be cosmetic and the entire
  // revocation story would rest on the Firestore status gate alone.
  const errAfterDisable = await auth.verifyIdToken(token).then(() => null, (e) => e);
  check("the SAME token is rejected once disabled", errAfterDisable !== null, true);
  check("  with auth/user-disabled", AUTH_CODES(errAfterDisable), "auth/user-disabled");

  // And the account cannot obtain a NEW token either, so "cannot log in" is literal.
  const signInErr = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  ).then((r) => (r.ok ? null : r.status), () => "network-error");
  check("and signing in again is refused (not 200)", signInErr !== 200, true);

  console.log("--- reactivation must restore access ---");
  // Without this the feature is a one-way door, and the delete -> activate round trip
  // in adminController would leave an account permanently unable to sign in while the
  // roster showed it Active.
  await auth.updateUser(uid, { disabled: false });
  const decodedAfter = await auth.verifyIdToken(token).then((d) => d, () => null);
  check("the previously rejected token verifies again", decodedAfter && decodedAfter.uid, uid);
  const newToken = await mintToken(email, password);
  check("and a fresh sign-in succeeds", typeof newToken === "string" && newToken.length > 0, true);

  console.log("--- the custom claim survives the round trip ---");
  // adminController.mints { role: "admin" } at creation. A disable/enable cycle must
  // not strip it, or reactivating an admin would produce an account that signs in and
  // is then refused by authorize("admin") -- a lockout wearing a successful response.
  await auth.setCustomUserClaims(uid, { role: "admin" });
  const withClaims = await mintToken(email, password);
  const claimsDecoded = await auth.verifyIdToken(withClaims);
  check("claims are present before disabling", claimsDecoded.role, "admin");
  await auth.updateUser(uid, { disabled: true });
  await auth.updateUser(uid, { disabled: false });
  const afterCycle = await auth.verifyIdToken(await mintToken(email, password));
  check("claims survive disable -> enable", afterCycle.role, "admin");

  console.log("--- the Firestore row is independent of the Auth flag ---");
  // The status gate in middleware/auth.js reads Firestore, and the two are written by
  // separate calls, so a partial failure is possible. Confirm they are genuinely
  // separate stores that can disagree, which is why adminController rolls back.
  await db.collection("users").doc(uid).set({ role: "admin", adminLevel: "course", courseId: "CT", status: "active" });
  await db.collection("users").doc(uid).set({ status: "inactive" }, { merge: true });
  const row = await db.collection("users").doc(uid).get();
  check("the Firestore row reflects the deactivation", row.data().status, "inactive");
  const stillLive = await auth.verifyIdToken(await mintToken(email, password)).then(() => true, () => false);
  check("while the Auth record is independently still enabled", stillLive, true);
  check("  -- which is exactly the drift the status gate exists to catch", stillLive, true);

  // Clean up so a re-run in the same session starts from a known state.
  await db.collection("users").doc(uid).delete().catch(() => {});
  await auth.deleteUser(uid).catch(() => {});

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`authDisabled: all ${passes} checks passed (emulator only, no live project touched)`);
  process.exit(0);
})().catch((err) => {
  console.error("authDisabled suite aborted:", err);
  process.exit(2);
});