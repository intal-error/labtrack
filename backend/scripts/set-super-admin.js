#!/usr/bin/env node
/**
 * Super Admin bootstrap and course assignment.
 *
 * WHY A SCRIPT AND NOT THE UI: `POST /api/admin` is Super-Admin-only, so there is
 * deliberately NO API route that can create a Super Admin. That is what guarantees
 * the system cannot quietly end up with two of them -- but it also means the first
 * one has to come from outside the API, or the install locks itself out of course
 * management. This script is the only place a Super Admin can be created.
 *
 * THREE MODES, because there are three distinct jobs and conflating them is how an
 * account gets promoted that its owner did not intend:
 *
 *   --list                                  read-only. What does everyone ACTUALLY
 *                                           have access to right now? See the note on
 *                                           effectiveTier() for why "assignedCourses"
 *                                           does not tell you.
 *
 *   --create --email … --first … --last …    a DEDICATED Super Admin account. No
 *                                           existing account is touched.
 *
 *   --assign-course <email|uid> <COURSE>    pin an existing admin to a Course Admin,
 *                                           keeping the course they already hold.
 *
 *   <email|uid>                             promote an existing admin (the original
 *                                           mode, unchanged).
 *
 * Usage:
 *   cd backend
 *   node scripts/set-super-admin.js --list
 *   node scripts/set-super-admin.js --create --email a@b.com --first A --last B [--position "..."] [--dry]
 *   node scripts/set-super-admin.js --assign-course a@b.com CT [--dry]
 *   node scripts/set-super-admin.js a@b.com [--dry]
 *
 * Common flags: --dry  --allow-second (create a second Super Admin anyway)
 *
 * Requires backend/.env with the FIREBASE_* credentials. --assign-course also uses
 * SUPABASE_* to confirm the course exists, and warns rather than failing if absent.
 */

require("dotenv").config();
const admin = require("firebase-admin");
const { getAdminCourses, effectiveTier, sortByTier, generatePassword } = require("../src/utils/adminTiers");

/*
 * ── Emulator support, fail-closed ────────────────────────────────────────────
 *
 * WHY: the rollback path in --adopt-super is the safety net for the one operation
 * that can half-configure an account, and it could only be exercised against real
 * Firebase by breaking a real account on purpose. Running it against the Firestore
 * and Auth emulators instead tests the identical code path with zero live writes.
 *
 * WHY FAIL-CLOSED, AND WHY IT IS KEYED ON THE ENV VARS ALONE: this switch decides
 * whether the script talks to your production project or to a throwaway emulator.
 * A half-set or inferred configuration is the dangerous case, so anything
 * inconsistent exits non-zero instead of guessing. Detection is by EXPLICIT
 * environment variable only -- never by probing, never by a fallback default -- so
 * production cannot fall into the emulator branch by accident.
 */
const EMULATOR_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || "";
const EMULATOR_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const emulatorMode = Boolean(EMULATOR_FIRESTORE || EMULATOR_AUTH);

if (emulatorMode && !(EMULATOR_FIRESTORE && EMULATOR_AUTH)) {
  console.error("FATAL: emulator mode requires BOTH emulator hosts to be set.");
  console.error(`  FIRESTORE_EMULATOR_HOST     : ${EMULATOR_FIRESTORE || "(unset)"}`);
  console.error(`  FIREBASE_AUTH_EMULATOR_HOST : ${EMULATOR_AUTH || "(unset)"}`);
  console.error("Refusing to guess. Set both, or unset both to use production.");
  process.exit(1);
}

/*
 * Fault injection, so a test can force a failure AFTER the claims write and prove
 * the rollback cleans up. This is a deliberate hook in production code, so it is
 * hard-locked to the emulator: without an emulator it exits non-zero rather than
 * doing anything. LABTRACK_FAULT is therefore inert against production by
 * construction, not by convention.
 */
const FAULT = process.env.LABTRACK_FAULT || "";
if (FAULT && !emulatorMode) {
  console.error("FATAL: LABTRACK_FAULT is a test hook and is only permitted against an emulator.");
  console.error(`  requested fault : ${FAULT}`);
  console.error("  emulator mode   : OFF (no FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST)");
  console.error("Refusing to run. It will never inject a fault into production.");
  process.exit(1);
}

const firebaseConfig = emulatorMode
  ? { projectId: process.env.FIREBASE_PROJECT_ID || "demo-labtrack-rules" }
  : {
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    };

if (!admin.apps.length) {
  admin.initializeApp(firebaseConfig);
}

const db = admin.firestore();
const auth = admin.auth();

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const positional = () => argv.filter((a) => !a.startsWith("--") && !isValueOfFlag(a));

/**
 * A value belongs to the flag immediately before it, so it is not mistaken for a
 * positional. Without this, `--create --email a@b.com` yields TWO positionals
 * ("a@b.com" and nothing) and the mode reads its target from the wrong one.
 */
const FLAG_VALUES = new Set(["--email", "--first", "--last", "--position"]);
function isValueOfFlag(token) {
  const i = argv.indexOf(token);
  return i > 0 && FLAG_VALUES.has(argv[i - 1]);
}

const DRY = hasFlag("--dry");
const ALLOW_SECOND = hasFlag("--allow-second");

const MODE = hasFlag("--list") ? "list"
  : hasFlag("--create") ? "create"
  : hasFlag("--assign-course") ? "assign"
  : hasFlag("--adopt-super") ? "adopt"
  : "promote";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fail = (message, ...lines) => {
  console.error(`\n${message}\n`);
  lines.forEach((l) => console.error(`  ${l}`));
  process.exit(1);
};

function describe(doc) {
  const name = `${doc.firstName || ""} ${doc.lastName || ""}`.trim();
  return `${name || "(no name)"} <${doc.email || "no email"}> [${doc.id}]`;
}


/** Every admin in the roster: `users` plus any legacy-only `admins` rows. */
async function loadAdmins() {
  const out = new Map();

  const usersSnap = await db.collection("users").where("role", "==", "admin").get();
  usersSnap.forEach((doc) => out.set(doc.id, { id: doc.id, ...doc.data() }));

  // Legacy mirrors are unreachable by that query, and one without a users/{uid}
  // counterpart still holds admin access, so it has to be read directly.
  const legacySnap = await db.collection("admins").get();
  legacySnap.forEach((doc) => {
    if (!out.has(doc.id)) out.set(doc.id, { id: doc.id, ...doc.data(), _legacyOnly: true });
  });

  return [...out.values()];
}

/** Matches on uid, then on email (case-insensitively). */
function findTarget(list, target) {
  const needle = String(target || "").trim().toLowerCase();
  return (
    list.find((a) => a.id === needle) ||
    list.find((a) => (a.email || "").toLowerCase() === needle) ||
    null
  );
}

/** Optional: the courses table, so we can validate a course id before writing. */
function getSupabase() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
    const { createClient } = require("@supabase/supabase-js");
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  } catch {
    return null;
  }
}

/**
 * Does this course exist in Supabase?
 *
 * The missing-table case gets its own message rather than being passed through.
 * Verified against a real project: when `courses` has not been created,
 * PostgREST answers with "Could not find the table 'public.courses' in the schema
 * cache" -- a phrase that means nothing to whoever has to act on it, and which
 * arrives wrapped in a stack trace with the migration filename nowhere in sight.
 * That is the same unapplied migration that breaks the dashboard, so it is worth
 * naming both.
 */
async function courseExists(supabase, id) {
  if (!supabase) return null; // unknown -- caller decides what to do about it
  const { data, error } = await supabase.from("courses").select("id").eq("id", id).limit(1);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error(
        `The 'courses' table does not exist in Supabase, so course "${id}" cannot be verified.\n` +
          `  Apply the course-scoping migrations first:\n` +
          `    backend/src/schema/20-courses.sql\n` +
          `    backend/src/schema/21-course-scope.sql\n` +
          `  (This is the same unapplied migration that makes the dashboard report\n` +
          `   "Couldn't load dashboard data" -- 21-course-scope.sql adds lab_rooms.course.)`
      );
    }
    throw new Error(error.message);
  }
  return Boolean(data && data.length > 0);
}

/**
 * The writes that make an account admin, in both collections.
 *
 * The mirror is not optional bookkeeping: middleware/auth.js resolveProfile falls
 * back to the `admins` collection, and a document found there without adminLevel
 * reads as a legacy unrestricted admin. The legacy assignedCourse/assignedCourses
 * fields are cleared rather than omitted, because those are what the tier used to be
 * INFERRED from, and leaving them would contradict the explicit value.
 */
async function writeAdminProfile(uid, patch) {
  const base = { updatedAt: new Date() };
  await db.collection("users").doc(uid).set({ ...base, ...patch }, { merge: true });
  try {
    await db.collection("admins").doc(uid).set({ ...base, ...patch }, { merge: true });
  } catch (err) {
    // Non-critical: `users` is authoritative and resolveProfile prefers it. The
    // mirror only matters for profiles that exist solely there.
    console.warn(`  NOTE  could not write the legacy admins mirror: ${err.message}`);
  }
  // Both caches are memoised for a minute; a tier or course change has to be
  // visible immediately or the old scope keeps routing work to the wrong admin.
  try {
    const { invalidateAdminsCache } = require("../src/utils/adminScope");
    invalidateAdminsCache();
  } catch {}
  try {
    const { invalidateRoomCourseCache } = require("../src/utils/roomScope");
    invalidateRoomCourseCache();
  } catch {}
}

// ── Input validation ─────────────────────────────────────────────────────────

function validateEmail(email) {
  const value = String(email || "").trim();
  if (!value) fail("An email is required.", "  --email you@slsu.edu.ph");
  if (value.length > 255) fail("Email is too long (max 255 characters).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(`"${value}" is not a valid email address.`);
  return value.toLowerCase();
}

function validateName(value, label) {
  const v = String(value || "").trim();
  if (!v) fail(`${label} is required.`, `  --${label.toLowerCase()} "Example"`);
  if (v.length > 100) fail(`${label} is too long (max 100 characters).`);
  return v;
}

// ── Modes ────────────────────────────────────────────────────────────────────

async function runList() {
  const admins = await loadAdmins();
  if (admins.length === 0) {
    console.log("No admins in the roster. Use --create to make the first Super Admin.");
    return;
  }

  const supers = admins.filter((a) => effectiveTier(a).key === "super");
  const legacyOnly = supers.filter((a) => !a.adminLevel);

  console.log(`\nROSTER  ${admins.length} admin(s)\n`);
  for (const a of sortByTier(admins)) {
    console.log(`  ${describe(a)}`);
    console.log(`      ${effectiveTier(a).label}`);
  }

  console.log(`\n${supers.length} account(s) can currently reach every course.`);
  if (legacyOnly.length > 0) {
    console.log(`${legacyOnly.length} of them only by LEGACY INFERENCE -- they have no adminLevel.`);
    console.log("They work today, but they are invisible to any check that reads adminLevel,");
    console.log("and they are Super Admins by accident rather than appointment. Pin each with:");
    console.log(`  node scripts/set-super-admin.js --assign-course <admin> <COURSE>\n`);
  }
  if (supers.length > 0 && legacyOnly.length === 0 && supers.every((a) => a.adminLevel === "super")) {
    console.log("All of them were appointed explicitly. Nothing to migrate.");
  }
}

async function runCreate() {
  const email = validateEmail(option("--email"));
  const firstName = validateName(option("--first"), "First name");
  const lastName = validateName(option("--last"), "Last name");
  const position = String(option("--position") || "Super Administrator").trim().slice(0, 100);

  const admins = await loadAdmins();
  const existingSupers = admins.filter((a) => a.adminLevel === "super");

  if (existingSupers.length > 0 && !ALLOW_SECOND) {
    fail(
      `A Super Admin already exists: ${describe(existingSupers[0])}`,
      "This script will not add a second one unless you pass --allow-second.",
      "Two accounts that can both create and deactivate every Course Admin is a hard",
      "thing to reason about, so it has to be a deliberate flag rather than a default."
    );
  }
  if (existingSupers.length > 1) {
    fail(`${existingSupers.length} Super Admins already exist. Refusing to add another.`);
  }

  // An existing Firebase Auth user with no profile is a different failure: the
  // account signs in but has no role, so it lands on ProfileGate forever.
  try {
    const existingAuthUser = await auth.getUserByEmail(email);
    fail(
      `An account already exists for ${email} (uid ${existingAuthUser.uid}).`,
      "Refusing to touch it: an existing account is an identity, not a new one.",
      "If it is already an admin you want promoted instead, run:",
      `  node scripts/set-super-admin.js ${email}`
    );
  } catch {
    // getUserByEmail throws auth/user-not-found, which is the answer we want.
  }

  const collides = findTarget(admins, email);
  if (collides) {
    fail(`A profile already exists for ${email}: ${describe(collides)}`);
  }

  console.log(`\nSuper Admin creation${DRY ? " (dry run -- nothing will be written)" : ""}\n`);
  console.log(`Will create: ${firstName} ${lastName} <${email}>`);
  console.log(`  position: ${position}`);
  console.log(`  role="admin", adminLevel="super", courseId=null`);
  console.log(`  writes to both users/{uid} and admins/{uid}`);
  console.log(`  password: generated in-process, never displayed, never on the command line`);

  if (DRY) {
    console.log("\nDry run. Re-run without --dry to apply.");
    return;
  }

  const password = generatePassword();

  const userRecord = await auth.createUser({
    email,
    password,
    displayName: `${firstName} ${lastName}`,
  });

  // Deliberately still just { role }. adminLevel and courseId are NOT claims: they
  // are read from the profile on every request, so changing them takes effect
  // immediately rather than at token expiry.
  await auth.setCustomUserClaims(userRecord.uid, { role: "admin" });

  await writeAdminProfile(userRecord.uid, {
    firstName,
    lastName,
    email,
    contact: "",
    position,
    role: "admin",
    adminLevel: "super",
    courseId: null,
    assignedCourse: "",
    assignedCourses: [],
    assignedYear: "",
    status: "active",
    createdAt: new Date(),
  });

  console.log(`\nCreated Firebase Auth user. uid: ${userRecord.uid}`);

  /*
   * Deliver the credential. The generated password is never printed, so the ONLY way
   * in is through a reset link -- there is no copy of it anywhere to leak.
   *
   * `generatePasswordResetLink` is the fallback because it needs no SMTP provider:
   * it returns a URL regardless of whether the project can send mail. The link is a
   * working credential in terminal scrollback, so it is labelled as one.
   */
  let emailed = false;
  try {
    await auth.sendPasswordResetEmail(email);
    emailed = true;
    console.log(`\nPassword reset email sent to ${email}. Check that inbox to choose your password.`);
  } catch (err) {
    console.log(`\nCould not send the reset email: ${err.message}`);
  }

  if (!emailed) {
    const link = await auth.generatePasswordResetLink(email);
    console.log(`\nOpen this link ONCE to choose your password:\n\n  ${link}\n`);
    console.log("It expires in about an hour. Clear your terminal scrollback afterwards --");
    console.log("until the password is changed, this link is a working credential.");
  }

  console.log(`\nOK  ${firstName} ${lastName} is the Super Admin.`);
  console.log("Verify with:  curl -H \"Authorization: Bearer <token>\" <api>/api/auth/profile");
  console.log("  expect adminLevel=\"super\", isSuperAdmin=true, courseName=\"\". No re-login needed.");
}

async function runAssignCourse() {
  const args2 = positional();
  const target = args2[0];
  const code = args2[1];

  if (!target) {
    fail("An admin is required.", "  node scripts/set-super-admin.js --assign-course <email|uid> <COURSE>");
  }
  if (!code) {
    fail("A course code is required.", "  node scripts/set-super-admin.js --assign-course <email|uid> CT");
  }

  const courseId = String(code).trim().toUpperCase();
  const supabase = getSupabase();
  if (supabase) {
    if (!(await courseExists(supabase, courseId))) {
      fail(
        `"${courseId}" is not a row in \`courses\`.`,
        "An admin pinned to a course that does not exist sees nothing at all, with no",
        "error to explain why. Check with:",
        "  node scripts/check-course-courses.js"
      );
    }
  } else {
    console.warn("  NOTE  SUPABASE_* not set — cannot confirm the course exists. Continuing anyway.");
  }

  const admins = await loadAdmins();
  const match = findTarget(admins, target);
  if (!match) {
    fail(`No admin matched "${target}". Roster:`, ...admins.map(describe));
  }
  if (match.role !== "admin") fail(`${describe(match)} has role "${match.role}", not "admin". Refusing.`);
  if (match._legacyOnly) {
    fail(
      `${describe(match)} exists only in the legacy 'admins' collection and has no users/{uid} profile.`,
      "Re-create the account through the app first."
    );
  }

  // A legacy admin holding several courses has no single scope to match, and that
  // multi-course shape is what let one person span two courses in the first place.
  // Pinning to one is the fix, so make the narrowing explicit rather than silent.
  const held = getAdminCourses(match);
  const narrowing = held.length > 1 ? ` (was: ${held.join(", ")})` : "";

  if (match.adminLevel === "super") {
    fail(
      `${describe(match)} is an explicit Super Admin.`,
      "This script pins COURSE admins. Demote them by hand first if that is really intended."
    );
  }
  if (match.adminLevel === "course" && match.courseId === courseId) {
    console.log(`\nOK  ${describe(match)} is already pinned to ${courseId}. Nothing to do.`);
    return;
  }

  console.log(`\nCourse assignment${DRY ? " (dry run -- nothing will be written)" : ""}\n`);
  console.log(`Will pin: ${describe(match)}`);
  console.log(`  -> adminLevel="course", courseId="${courseId}"${narrowing}`);
  console.log("  -> clears assignedCourse/assignedCourses, so the legacy tier inference");
  console.log("     can no longer resolve this account as a Super Admin");

  if (DRY) {
    console.log("\nDry run. Re-run without --dry to apply.");
    return;
  }

  await writeAdminProfile(match.id, {
    adminLevel: "course",
    courseId,
    assignedCourse: courseId,
    assignedCourses: [courseId],
  });

  console.log(`\nOK  ${describe(match)} is now a Course Admin for ${courseId}.`);
  console.log("Takes effect on their next request — no token refresh needed.");
  console.log("Run --list to confirm the whole roster.");
}

async function runPromote() {
  const target = positional()[0];
  if (!target) {
    fail("Usage:", "  node scripts/set-super-admin.js <email|uid> [--dry]");
  }

  const admins = await loadAdmins();
  if (admins.length === 0) {
    fail(
      "No admins found in the roster.",
      "Create the first one with --create instead of promoting an account that does not exist."
    );
  }

  const existingSupers = admins.filter((a) => a.adminLevel === "super");
  if (existingSupers.length > 1) {
    fail(`${existingSupers.length} Super Admins already exist. Refusing to add another:`, ...existingSupers.map(describe));
  }

  const match = findTarget(admins, target);

  // Idempotent: re-running against the current Super Admin is a success, because an
  // operator who loses the CLI state should not be stuck.
  if (existingSupers.length === 1 && match && match.id === existingSupers[0].id) {
    console.log(`\nOK  ${describe(match)} is already the Super Admin. Nothing to do.`);
    return;
  }

  if (!match) {
    fail(`No admin matched "${target}". Roster:`, ...admins.map(describe));
  }
  if (match.role !== "admin") fail(`${describe(match)} has role "${match.role}", not "admin". Refusing.`);
  if (match._legacyOnly) {
    fail(
      `${describe(match)} exists only in the legacy 'admins' collection and has no users/{uid} profile.`,
      "Re-create the account through the app first."
    );
  }
  if (existingSupers.length === 1) {
    const current = existingSupers[0];
    fail(
      `A Super Admin already exists: ${describe(current)}`,
      "This script will not replace them. Demote that account by hand first if the",
      "appointment genuinely needs to change."
    );
  }

  console.log(`\nSuper Admin bootstrap${DRY ? " (dry run -- nothing will be written)" : ""}\n`);
  console.log(`Will appoint: ${describe(match)}`);
  const held = getAdminCourses(match);
  if (held.length) console.log(`  it is currently scoped to: ${held.join(", ")} -> clearing, since a Super Admin sees all courses`);
  console.log(`  sets adminLevel="super", courseId=null`);
  console.log(`  writes to both users/${match.id} and admins/${match.id}`);

  if (DRY) {
    console.log("\nDry run. Re-run without --dry to apply.");
    return;
  }

  await writeAdminProfile(match.id, {
    adminLevel: "super",
    courseId: null,
    assignedCourses: [],
    assignedCourse: "",
  });

  console.log(`\nOK  ${describe(match)} is now the Super Admin.`);
  console.log("Existing sessions are unaffected: adminLevel is read from the profile on");
  console.log("every request, so nobody needs to sign in again.");
}

/**
 * Turns an ALREADY-EXISTING Firebase Auth account into the Super Admin.
 *
 * WHY A SEPARATE MODE FROM --create: --create refuses an email that already has an
 * Auth account (see runCreate), on purpose -- an existing account is an identity,
 * not a new one, and silently rewriting one is how you lock somebody out. But an
 * operator who has just made the account by hand in the Firebase console is doing
 * exactly the legitimate thing and has no other way in: runPromote needs an existing
 * roster profile, and a brand-new account has none.
 *
 * The whole mode is built around NOT touching anything that already exists:
 *
 *   - It aborts if EITHER users/{uid} or admins/{uid} already exists. There is no
 *     --force, because the one case that would need one (converting a live student)
 *     is exactly the case where a mistake is most expensive.
 *   - Rollback is keyed on the uid this run wrote, and only removes documents it
 *     created itself. It cannot delete a pre-existing account, because the aborts
 *     above prove none existed when the run began.
 *   - Claims are set BEFORE the profile, so a failure part-way cannot leave an
 *     account that signs in but has no profile and lands on ProfileGate forever.
 */
async function runAdoptSuper() {
  const target = positional()[0];
  if (!target) {
    fail(
      "Usage:",
      '  node scripts/set-super-admin.js --adopt-super <email|uid> --first <First> --last <Last> [--position "..."] [--dry]',
      "",
      "Use this for an account you already created in Firebase Authentication.",
      "Use --create instead to make a brand new account with a generated password."
    );
  }

  const email = validateEmail(option("--email") || target);
  const firstName = validateName(option("--first"), "First name");
  const lastName = validateName(option("--last"), "Last name");
  const position = String(option("--position") || "Super Administrator").trim().slice(0, 100);

  // Resolve by email, falling back to treating the target as a uid. Both paths are
  // tried so a UID/email mismatch is reported rather than quietly configuring some
  // third account.
  //
  // NOTE getUserByEmail(), NOT getUser(): the Admin SDK's getUser() takes a UID and
  // silently treats any other string as one, so passing an email here reports
  // "no such account" for an account that plainly exists.
  let userRecord = null;
  let resolveError = null;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    resolveError = err;
  }
  if (!userRecord) {
    try {
      userRecord = await auth.getUser(String(target));
    } catch {
      fail(
        `No Firebase Authentication account matches "${target}".`,
        `  as an email : ${email}  (${resolveError ? resolveError.code : "not found"})`,
        `  as a uid    : ${target}`,
        "This mode never CREATES an account -- confirm the address in the Firebase console."
      );
    }
  }
  if (userRecord.disabled) {
    fail(`${userRecord.email} is disabled in Firebase Authentication. Re-enable it first.`);
  }

  const uid = userRecord.uid;
  const sameEmail = (await auth.listUsers(1000)).users.filter(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (sameEmail.length > 1) {
    fail(
      `${sameEmail.length} Auth accounts share the email ${userRecord.email}. Refusing:`,
      ...sameEmail.map((u) => `  uid ${u.uid}`),
      "adopting one of several would leave you with two Super Admins."
    );
  }

  // The roster is loaded before any write so an EXISTING Super Admin is caught, and
  // so an admins/-only legacy record under a differently-cased copy of this same
  // email is surfaced rather than duplicated.
  const roster = await loadAdmins();
  const elsewhere = roster.find(
    (a) => (a.email || "").toLowerCase() === email.toLowerCase() && a.id !== uid
  );
  if (elsewhere) {
    fail(
      `A DIFFERENT admin profile already uses this email: ${describe(elsewhere)} (uid ${elsewhere.id})`,
      "It has no Auth account of its own, so it looks like a leftover.",
      "Deleting it is a separate, manual decision -- this script will not remove a",
      "document that already existed before it ran."
    );
  }

  const existingSuper = roster.find((a) => a.adminLevel === "super");
  if (existingSuper) {
    fail(
      `A Super Admin already exists: ${describe(existingSuper)}`,
      "This script will not add a second one."
    );
  }

  const usersSnap = await db.collection("users").doc(uid).get();
  const adminsSnap = await db.collection("admins").doc(uid).get();
  if (usersSnap.exists) {
    fail(
      `users/${uid} already exists (role "${usersSnap.data().role}").`,
      "Refusing to overwrite an existing profile. There is no --force: converting a",
      "live student account is the one case where a mistake is most expensive."
    );
  }
  if (adminsSnap.exists) {
    fail(`admins/${uid} already exists. Refusing to overwrite an existing profile.`);
  }

  console.log(`\nSuper Admin adoption${DRY ? " (dry run -- nothing will be written)" : ""}\n`);
  console.log(`Adopting existing Auth account: ${userRecord.displayName || "(no display name)"} <${userRecord.email}>`);
  console.log(`  uid            : ${uid}`);
  console.log(`  created        : ${userRecord.metadata.creationTime}`);
  console.log(`  name to write  : ${firstName} ${lastName}`);
  console.log(`  position       : ${position}`);
  console.log(`  custom claims  : ${JSON.stringify(userRecord.customClaims) || "none"} -> { "role": "admin" }`);
  console.log('  profile        : role="admin", adminLevel="super", courseId=null');
  console.log(`  creates        : users/${uid} and admins/${uid}   (both absent -> nothing overwritten)`);
  console.log("  clears assignedCourse / assignedCourses so the legacy tier inference cannot contradict adminLevel");
  console.log("  writes nothing else: no other document and no other account is touched");

  if (DRY) {
    console.log("\nDry run. Nothing was written. Re-run without --dry to apply.");
    return;
  }

  // Claims first. If the profile write below fails, the account would have
  // { role: "admin" } but no profile at all, which resolveProfile reports as no
  // profile -- the ProfileGate outcome the rollback exists to prevent. The reverse
  // order would leave an account that looks like a Course Admin until claims land.
  //
  // previousClaims is captured BEFORE the write and restored on rollback. Nulling
  // the claims instead would be wrong for any account that already had some: a
  // student account carrying {"role":"student"} would come out of a failed run
  // stripped of it. Restoring the prior value makes rollback mean "put it back",
  // not "forget it".
  const previousClaims = userRecord.customClaims ?? null;
  let claimsSet = false;
  try {
    await auth.setCustomUserClaims(uid, { role: "admin" });
    claimsSet = true;

    // Emulator-only test hook. LABTRACK_FAULT is rejected outright above unless the
    // script is running against emulators, so this can never fire in production.
    if (FAULT === "after-claims") {
      throw new Error(
        `fault injection (LABTRACK_FAULT=after-claims): failing AFTER the claims write, ` +
        `BEFORE the profile write -- the window that previously left an orphaned Auth account.`
      );
    }

    await writeAdminProfile(uid, {
      firstName,
      lastName,
      email: userRecord.email,
      contact: "",
      position,
      role: "admin",
      adminLevel: "super",
      courseId: null,
      assignedCourse: "",
      assignedCourses: [],
      assignedYear: "",
      status: "active",
      createdAt: new Date(),
    });
  } catch (err) {
    console.error(`\nFAILED: ${err.message || err}`);
    console.error("Rolling back, so no half-configured account is left behind.");
    // Only documents this run created, keyed to this uid -- and the pre-delete
    // checks above proved no profile existed for it when the run began, so this
    // cannot remove a pre-existing document. The Auth account is NEVER deleted
    // here: it predates the run, and destroying it would be losing a real identity.
    try {
      await db.collection("admins").doc(uid).delete();
      await db.collection("users").doc(uid).delete();
      console.error(`  removed users/${uid} and admins/${uid}, both created by this run`);
    } catch (cleanupErr) {
      console.error(`  WARNING could not remove them: ${cleanupErr.message}`);
      console.error(`  Delete by hand:  users/${uid}  and  admins/${uid}`);
    }
    if (claimsSet) {
      try {
        await auth.setCustomUserClaims(uid, previousClaims);
        console.error(
          previousClaims
            ? `  restored the custom claims this run replaced: ${JSON.stringify(previousClaims)}`
            : "  cleared the custom claims this run set (there were none before)"
        );
      } catch (claimErr) {
        console.error(`  WARNING could not restore custom claims: ${claimErr.message}`);
        console.error(`  Restore by hand: Firebase console > Authentication > ${userRecord.email} > Edit`);
      }
    }
    process.exit(1);
  }

  console.log(`\nOK  ${firstName} ${lastName} <${userRecord.email}> is the Super Admin (uid ${uid}).`);
  console.log("Verify with:  node scripts/set-super-admin.js --list");
  console.log("  adminLevel is read from the profile on every request, so no re-login is needed.");
}

// ── Entry ────────────────────────────────────────────────────────────────────

const MODE_LABEL = { list: "--list", create: "--create", assign: "--assign-course", adopt: "--adopt-super", promote: "<email|uid>" };
console.log(`Super Admin bootstrap — mode ${MODE_LABEL[MODE]}${DRY ? " (dry run)" : ""}`);

(async () => {
  if (MODE === "list") return runList();
  if (MODE === "create") return runCreate();
  if (MODE === "assign") return runAssignCourse();
  if (MODE === "adopt") return runAdoptSuper();
  return runPromote();
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    if (process.env.NODE_ENV === "development") console.error(err.stack);
    process.exit(2);
  });
