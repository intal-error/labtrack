#!/usr/bin/env node
/**
 * Backfill Script: lab_attendance course / year / section
 *
 * The `section` column already exists in the schema but `timeIn` never wrote it,
 * so existing attendance rows have a NULL section. This script copies course,
 * year, and section from each student's Firestore profile onto their attendance
 * records -- but ONLY where the attendance value is currently blank. Existing
 * data is never overwritten, so the script is safe to re-run.
 *
 * SAFETY: if two Firestore docs share a schoolId but disagree on course/year/
 * section, the script REFUSES to guess and skips that student entirely. Merge
 * those duplicate docs first, then re-run.
 *
 * Usage:
 *   cd backend
 *   node scripts/backfill-attendance-section.js            # apply changes
 *   node scripts/backfill-attendance-section.js --dry-run  # report only
 *
 * Requires env vars (backend/.env): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 *   FIREBASE_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

require("dotenv").config();

const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const USERS = "users";
const FIELDS = ["course", "year", "section"];

// --- Firebase Admin Init ---
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawPrivateKey) {
  console.error("Missing Firebase credentials in environment variables.");
  process.exit(1);
}

const privateKey = rawPrivateKey
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

// --- Supabase Init ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables.");
  console.error(`SUPABASE_URL: ${supabaseUrl ? "OK" : "MISSING"}`);
  console.error(`SUPABASE_SERVICE_KEY: ${supabaseKey ? "OK" : "MISSING"}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";

async function loadProfiles() {
  const snap = await db.collection(USERS).get();
  const bySchoolId = new Map();
  const docCount = new Map();
  const conflicts = new Set();
  const duplicates = new Set();
  for (const doc of snap.docs) {
    const data = doc.data();
    const schoolId = (data.schoolId || data.schoolID || "").trim();
    if (!schoolId) continue;
    const profile = {};
    for (const field of FIELDS) profile[field] = (data[field] || "").trim();

    const existing = bySchoolId.get(schoolId);
    if (!existing) {
      bySchoolId.set(schoolId, { ...profile });
      docCount.set(schoolId, 1);
      continue;
    }

    docCount.set(schoolId, (docCount.get(schoolId) || 1) + 1);
    for (const field of FIELDS) {
      if (!profile[field]) continue;
      if (existing[field] && existing[field] !== profile[field]) {
        conflicts.add(schoolId);
      } else {
        existing[field] = profile[field];
      }
    }
  }
  for (const [schoolId, count] of docCount) {
    if (count > 1 && !conflicts.has(schoolId)) duplicates.add(schoolId);
  }
  return { bySchoolId, conflicts, duplicates };
}

async function backfill() {
  console.log(`Starting lab_attendance backfill${DRY_RUN ? " (DRY RUN -- no writes)" : ""}.\n`);

  const { bySchoolId, conflicts, duplicates } = await loadProfiles();
  console.log(`Loaded ${bySchoolId.size} unique student school ID(s) from Firestore.\n`);

  if (duplicates.size > 0 || conflicts.size > 0) {
    if (duplicates.size > 0) {
      console.log(`WARNING: ${duplicates.size} school ID(s) have multiple Firestore docs with matching values: ${[...duplicates].join(", ")}`);
    }
    if (conflicts.size > 0) {
      console.log(`\nBLOCKING: ${conflicts.size} school ID(s) have CONFLICTING profile values across duplicate docs.`);
      console.log(`These are SKIPPED -- the script will not guess which value is correct.`);
      console.log(`Affected: ${[...conflicts].join(", ")}\n`);
      console.log(`Inspect and merge these Firestore docs by hand, then re-run this script.\n`);
    }
  }

  const { data: records, error } = await supabase
    .from("lab_attendance")
    .select("id, student_school_id, course, year, section");
  if (error) throw error;

  const all = records || [];
  const needsWork = all.filter((r) => FIELDS.some((f) => isBlank(r[f])));
  console.log(`Scanned ${all.length} attendance record(s); ${needsWork.length} have a blank course/year/section.\n`);

  if (needsWork.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  let updated = 0;
  let unchanged = 0;
  const noProfile = [];
  const skipped = new Set();
  const failures = [];

  for (const record of needsWork) {
    const schoolId = (record.student_school_id || "").trim();
    if (conflicts.has(schoolId)) {
      skipped.add(schoolId);
      continue;
    }
    const profile = bySchoolId.get(schoolId);
    if (!profile) {
      noProfile.push(record);
      continue;
    }

    const patch = {};
    for (const field of FIELDS) {
      if (isBlank(record[field]) && !isBlank(profile[field])) patch[field] = profile[field];
    }

    if (Object.keys(patch).length === 0) {
      unchanged++;
      continue;
    }

    if (DRY_RUN) {
      updated++;
      continue;
    }

    patch.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("lab_attendance")
      .update(patch)
      .eq("id", record.id);
    if (updateError) {
      failures.push({ id: record.id, error: updateError.message });
    } else {
      updated++;
    }
  }

  console.log(`${DRY_RUN ? "Would update" : "Updated"}: ${updated} record(s).`);
  console.log(`No profile found: ${noProfile.length} record(s).`);
  console.log(`Profile itself has no value for the blank field(s): ${unchanged} record(s).`);
  if (skipped.size > 0) {
    console.log(`Skipped due to conflicting duplicate profiles: ${skipped.size} student(s) -- ${[...skipped].join(", ")}`);
  }

  if (noProfile.length > 0) {
    const sample = noProfile.slice(0, 10).map((r) => r.student_school_id || "(blank id)");
    console.log(`\nUnmatched student IDs (first ${sample.length}):`);
    console.log(`  ${sample.join(", ")}`);
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} update(s) FAILED:`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`);
  }
}

backfill()
  .then(async () => {
    console.log("\nDone.");
    process.exitCode = 0;
    await admin.app().delete();
  })
  .catch(async (err) => {
    console.error("\nBackfill failed:", err.message);
    process.exitCode = 1;
    await admin.app().delete();
  });
