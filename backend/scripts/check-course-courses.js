#!/usr/bin/env node
/**
 * Audit Script: course-scope integrity. READ-ONLY — makes no writes.
 *
 * Run this BEFORE deploying the course-scoped surfaces and after adding any
 * course, because the scoping rules fail CLOSED: a row whose course matches no
 * row in `courses` is invisible to every Course Admin. That is the correct
 * security property and a genuinely confusing symptom when it is caused by a
 * typo rather than by a real leak. This script tells the two apart.
 *
 * Problems that exit 1 (fix before deploying):
 *
 *   1. UNKNOWN COURSE — a `course` value that is not a row in `courses`. Every
 *      row carrying it is hidden from all Course Admins and visible only to the
 *      Super Admin. Usually a program code that reached the signup dropdown but
 *      was never seeded into `courses`.
 *   2. ORPHAN ROOM CODE — a lab_attendance row whose room_code matches no
 *      lab_rooms row. Once attendance is scoped by room OWNERSHIP these rows
 *      belong to no course and are hidden from every Course Admin. Usually a
 *      stale room_code, which is what scripts/check-room-codes.js reports.
 *
 * Reported but NOT fatal (exit 0):
 *
 *   3. UNASSIGNED ROOM — a lab_rooms row with no `course`. Rooms are assigned by
 *      hand in the Room QR Codes tab, so this is expected state until somebody
 *      gets to it. Such a room is Super Admin only in the meantime.
 *
 * Usage:
 *   cd backend
 *   node scripts/check-course-courses.js
 *
 * Exit 0 clean, 1 problems found, 2 could not read the data.
 * Requires backend/.env. The Firestore student-profile check is skipped with a
 * notice if the FIREBASE_* credentials are absent, since it is supplementary.
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (see backend/.env).");
  process.exit(2);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/** Each course-bearing column, so the report names exactly where it appears. */
const COURSE_COLUMNS = [
  { table: "catalog", column: "course" },
  { table: "transactions", column: "course" },
  { table: "transactions", column: "equipment_course" },
  { table: "incidents", column: "reporter_course" },
  { table: "incidents", column: "item_course" },
  { table: "maintenance", column: "course" },
  { table: "lab_attendance", column: "course" },
];

async function countDistinct(table, column) {
  const { data, error } = await supabase.from(table).select(column);
  if (error) throw new Error(`${table}.${column}: ${error.message}`);

  const counts = new Map();
  for (const row of data || []) {
    const value = (row[column] || "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function hasFirebase() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );
}

async function studentCourses() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  const snap = await admin.firestore().collection("users").where("role", "==", "student").get();
  const counts = new Map();
  snap.forEach((doc) => {
    const value = (doc.data().course || "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

(async () => {
  const problems = [];
  const advisories = [];

  const [coursesRes, roomsRes, ...countResults] = await Promise.all([
    supabase.from("courses").select("id"),
    supabase.from("lab_rooms").select("id, room_name, room_code, course"),
    ...COURSE_COLUMNS.map(({ table, column }) => countDistinct(table, column)),
  ]);

  if (coursesRes.error) throw new Error(`courses: ${coursesRes.error.message}`);
  if (roomsRes.error) throw new Error(`lab_rooms: ${roomsRes.error.message}`);

  const courseIds = new Set((coursesRes.data || []).map((c) => c.id));
  const roomRows = roomsRes.data || [];
  const roomCodes = new Set(roomRows.map((r) => r.room_code).filter(Boolean));

  console.log(`Seeded course scopes: ${courseIds.size}`);

  const labelCounts = COURSE_COLUMNS.map(
    ({ table, column }, i) => [`${table}.${column}`, countResults[i]]
  );
  if (hasFirebase()) labelCounts.push(["firestore users", await studentCourses()]);
  else console.log("NOTE  FIREBASE_* not set — skipped the student-profile course check.");

  console.log(`Checked ${COURSE_COLUMNS.length} course column(s).`);
  console.log(`${labelCounts.length} source(s) including student profiles.\n`);

  // --- 1. unknown course values -------------------------------------------------
  // Collected across every source first, so one course appearing in six tables is
  // reported once with a total, rather than six times.
  const findings = new Map();

  for (const [label, counts] of labelCounts) {
    for (const [value, count] of counts) {
      const prior = findings.get(value);
      if (prior) {
        prior.count += count;
        if (!prior.labels.includes(label)) prior.labels.push(label);
      } else {
        findings.set(value, { count, labels: [label] });
      }
    }
  }

  for (const [value, info] of findings) {
    if (courseIds.has(value)) continue;
    const quoted = value.replace(/'/g, "''");
    problems.push({
      kind: "UNKNOWN COURSE",
      detail:
        `"${value}" appears in ${info.labels.join(", ")} (${info.count} value(s)) but is not a row in ` +
        "`courses`. Every row carrying it is hidden from all Course Admins and visible only to the " +
        `Super Admin. Add it with:\n` +
        `      INSERT INTO courses (id, name) VALUES ('${quoted}', '<display name>');`,
    });
  }

  // --- 2. attendance rows whose room matches no room -----------------------------
  const attRes = await supabase.from("lab_attendance").select("id, room_code");
  if (attRes.error) throw new Error(`lab_attendance: ${attRes.error.message}`);

  const attRows = attRes.data || [];
  const orphans = attRows.filter((r) => !r.room_code || !roomCodes.has(r.room_code));
  if (orphans.length > 0) {
    const noCode = orphans.filter((r) => !r.room_code).length;
    problems.push({
      kind: "ORPHAN ROOM CODE",
      detail:
        `${orphans.length} lab_attendance row(s) reference a room_code that matches no lab_rooms row` +
        `${noCode ? ` (${noCode} of them have no room_code at all)` : ""}. Once attendance is scoped by ` +
        "room ownership these rows belong to no course and are hidden from every Course Admin. Run " +
        "scripts/check-room-codes.js — a stale room_code is the usual cause.",
    });
  }

  // --- 3. unassigned rooms (advisory) --------------------------------------------
  const unassigned = roomRows.filter((r) => !r.course);
  if (unassigned.length > 0) {
    advisories.push({
      kind: "UNASSIGNED ROOM",
      rooms: unassigned.map((r) => r.room_name || r.room_code || r.id),
      detail:
        "Super Admin only until assigned. Assign them in Settings -> Room QR Codes, or with:\n" +
        "      UPDATE lab_rooms SET course = '<CT|CPT|AT|CTV|ELT|ELX|FSM|MT|BIT>' WHERE room_code = '<code>';",
    });
  }

  // --- report ---------------------------------------------------------------------
  if (advisories.length > 0) {
    console.log(`${advisories.length} advisory item(s), not fatal:\n`);
    for (const a of advisories) {
      console.log(`  [${a.kind}] ${a.rooms.length} room(s)`);
      a.rooms.forEach((r) => console.log(`      - ${r}`));
      console.log(`      ${a.detail}\n`);
    }
  }

  if (problems.length === 0) {
    console.log("OK  No course-scope integrity problems found.");
    process.exit(0);
  }

  console.log(`${problems.length} problem(s) found:\n`);
  for (const p of problems) {
    console.log(`  [${p.kind}]`);
    console.log(`      ${p.detail}\n`);
  }
  process.exit(1);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(2);
});