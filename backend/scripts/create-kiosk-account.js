#!/usr/bin/env node
/**
 * Creates the dedicated attendance KIOSK account.
 *
 * WHY A SCRIPT AND NOT THE API: there is no path through the app that can create a
 * `role: "kiosk"` account, and that is deliberate rather than an oversight.
 *
 *   - POST /api/admin is requireSuperAdmin-gated and adminController.create() forces
 *     role:"admin" plus an adminLevel of course| super. A kiosk is neither.
 *   - POST /api/auth/register is z.literal("student") (middleware/validate.js:17) and
 *     authController.register rejects anything else again at :95-97.
 *
 * So a kiosk account can only be provisioned out of band, the same way the first Super
 * Admin was (scripts/set-super-admin.js). This is a copy of that file's shape, reduced
 * to one job.
 *
 * THE ONE RULE THAT MATTERS MOST: it writes `users/{uid}` and NEVER `admins/{uid}`.
 *
 * `resolveProfile` (middleware/auth.js:44-47) reads users/ first, then falls back to
 * admins/ and FORCES `role: "admin"` on anything it finds there -- the spread order is
 * `{ id, ...data, role: "admin" }`, so a stored role field cannot override it. Writing
 * this account into admins/ would therefore promote it to admin on the very next
 * request, silently handing the kiosk every admin route: catalog writes, incident
 * review, borrow approvals, reports, settings. The check below refuses to proceed if an
 * admins/ document already exists for the uid.
 *
 * LEAST PRIVILEGE, and why it holds. The only thing that makes this account able to do
 * anything is the `role: "kiosk"` claim, because authorize() is an exact string match
 * (auth.js:111). So:
 *
 *   - it passes authorize("kiosk") on the four attendance routes
 *   - it FAILS every authorize("admin") route, because "kiosk" !== "admin"
 *   - scopeCodes() returns null for a non-admin (courseScope.js:84), so it is
 *     unrestricted by course -- which is why it must never be given a courseId, and
 *     why it is confined to the four endpoints below.
 *
 * Usage:
 *   node scripts/create-kiosk-account.js --email kiosk@slsu.edu.ph [--dry]
 *   node scripts/create-kiosk-account.js --list
 */

require("dotenv").config();
const admin = require("firebase-admin");
const { generatePassword } = require("../src/utils/adminTiers");

const app = admin.apps.length ? admin.app() : admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const auth = admin.auth(app);
const db = admin.firestore(app);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const DRY = has("--dry");
const MODE = has("--list") ? "list" : "create";

function fail(...lines) {
  console.error("");
  console.error(lines.join("\n"));
  process.exit(1);
}

/** Email comes from an operator, not a public surface, but validate it anyway. */
function validateEmail(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) fail("An email is required.", "  --email kiosk@slsu.edu.ph");
  if (value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    fail(`"${value}" is not a valid email address.`);
  }
  return value;
}

const describeKiosk = (u) => `kiosk <${u.email}> [${u.uid}]`;

async function runList() {
  console.log("\nKiosk accounts\n");
  let found = 0;
  const users = await auth.listUsers(1000);
  for (const u of users.users) {
    if (u.customClaims?.role !== "kiosk") continue;
    found += 1;
    const inUsers = (await db.collection("users").doc(u.uid).get()).exists;
    const inAdmins = (await db.collection("admins").doc(u.uid).get()).exists;
    console.log(`  ${describeKiosk(u)}`);
    console.log(`     users/${u.uid}: ${inUsers ? "present" : "ABSENT"}   admins/${u.uid}: ${inAdmins ? "*** PRESENT - WOULD BE PROMOTED TO ADMIN ***" : "absent (correct)"}`);
    console.log(`     never signed in: ${!u.metadata.lastSignInTime}`);
  }
  console.log(`\n  ${found} kiosk account(s).`);
  if (found > 1) {
    console.log("  Note: more than one exists. Each is an independent signer-in for attendance.");
  }
}

async function runCreate() {
  const email = validateEmail(opt("--email"));

  console.log(`\nKiosk account creation${DRY ? " (dry run -- nothing will be written)" : ""}\n`);

  // Refuse if the address is already in use. An existing Auth account is an identity,
  // not a new one, and overwriting its role would be a privilege change nobody asked for.
  let existing = null;
  try {
    existing = await auth.getUserByEmail(email);
  } catch {
    // user-not-found is the answer we want.
  }
  if (existing) {
    fail(
      `An account already exists for ${email}: uid ${existing.uid}`,
      `  current claims: ${JSON.stringify(existing.customClaims) || "none"}`,
      "If that IS your kiosk, you are done -- run --list instead.",
      "If it is something else, use a different address rather than converting it here."
    );
  }

  // Nothing else may hold this email as an admin. resolveProfile prefers users/, but a
  // users/-only doc with a colliding address is a support trap, so surface it.
  const admins = await db.collection("admins").get();
  const clash = admins.docs.find(
    (d) => (d.data().email || "").toLowerCase() === email && d.data().role === "admin"
  );
  if (clash) {
    fail(
      `An admin profile already uses ${email}: ${clash.id}`,
      "Refusing. Choose a dedicated address for the kiosk."
    );
  }

  console.log(`  will create a Firebase Auth user for: ${email}`);
  console.log('  custom claims : { "role": "kiosk" }   (and nothing else)');
  console.log("  profile       : users/{uid} with role=\"kiosk\", status=\"active\"");
  console.log("  NOT written   : admins/{uid}  <- resolveProfile would force role:\"admin\" there");
  console.log("  no courseId   : a non-admin resolves scopeCodes() to null, so a course here would be inert");
  console.log("  password      : generated in-process, never displayed, never on the command line");

  if (DRY) {
    console.log("\nDry run. Nothing was written. Re-run without --dry to apply.");
    return;
  }

  const password = generatePassword();

  // Claims BEFORE the profile, matching set-super-admin.js. If the profile write
  // failed, the account would have {role:"kiosk"} and no users/ document, which
  // resolveProfile reports as no profile -- a signed-in account that can do nothing and
  // lands on ProfileGate forever. The reverse order would leave an account that looks
  // ordinary. Either way we roll back below.
  let createdUid = null;
  let claimsSet = false;
  try {
    const user = await auth.createUser({ email, password, displayName: "Attendance Kiosk" });
    createdUid = user.uid;
    await auth.setCustomUserClaims(createdUid, { role: "kiosk" });
    claimsSet = true;

    await db.collection("users").doc(createdUid).set({
      uid: createdUid,
      email,
      role: "kiosk",
      status: "active",
      displayName: "Attendance Kiosk",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // The invariant, asserted rather than assumed. If this ever fires, the account is
    // promotable to admin by anyone who can write to admins/.
    const inAdmins = (await db.collection("admins").doc(createdUid).get()).exists;
    if (inAdmins) {
      throw new Error("refusing to continue: an admins/ document exists for this uid");
    }
  } catch (err) {
    console.error(`\nFAILED: ${err.message || err}`);
    console.error("Rolling back.");
    if (createdUid) {
      try {
        await db.collection("users").doc(createdUid).delete();
        await db.collection("admins").doc(createdUid).delete();
        console.error("  removed any profile documents created by this run");
      } catch (cleanupErr) {
        console.error(`  WARNING could not remove documents: ${cleanupErr.message}`);
      }
      if (claimsSet) {
        try {
          await auth.setCustomUserClaims(createdUid, null);
          console.error("  cleared the custom claims this run set");
        } catch (claimErr) {
          console.error(`  WARNING could not clear claims: ${claimErr.message}`);
        }
      }
      try {
        await auth.deleteUser(createdUid);
        console.error("  deleted the Auth account created by this run");
      } catch (authErr) {
        console.error(`  WARNING could not delete the Auth user: ${authErr.message}`);
      }
    }
    process.exit(1);
  }

  // Deliver the credential without ever printing it. generatePasswordResetLink works
  // whether or not the project can send mail, and returns a URL either way -- so it is
  // the reliable path, at the cost of putting a working credential in the terminal.
  let emailed = false;
  try {
    await auth.sendPasswordResetEmail(email);
    emailed = true;
    console.log(`\nPassword reset email sent to ${email}. Open it to choose the password.`);
  } catch (err) {
    console.log(`\nCould not send the reset email: ${err.message}`);
  }
  if (!emailed) {
    const link = await auth.generatePasswordResetLink(email);
    console.log(`\nOpen this link ONCE to choose the password:\n\n  ${link}\n`);
    console.log("It expires in about an hour. Clear your scrollback afterwards -- until the");
    console.log("password is changed, this link IS the credential.");
  }

  console.log(`\nOK  kiosk account created: ${email} (uid ${createdUid})`);
  console.log("  sign in at /attend/kiosk with this address");
  console.log("  verify with: node scripts/create-kiosk-account.js --list");
}

console.log(`Kiosk account — mode ${MODE}${DRY ? " (dry run)" : ""}`);
(async () => {
  if (MODE === "list") return runList();
  return runCreate();
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    if (process.env.NODE_ENV === "development") console.error(err.stack);
    process.exit(2);
  });