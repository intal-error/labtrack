// Verifies the two fixes that made attendance data disappear on a live install:
//
//  1. THE DAY BOUNDARY CAME FROM THE HOST CLOCK. Every date boundary was derived
//     with new Date().getFullYear() and friends, which return the SERVER's
//     calendar day. The deploy target (Render) runs UTC with no TZ set, so for 8
//     hours of every Philippine day the server's "today" was YESTERDAY: a 07:30
//     scan was written under the previous date, so the student was missing from
//     Today's Log and "Currently Inside" reported an empty building. utils/
//     schoolClock.js pins the clock to SCHOOL_TIMEZONE instead.
//
//  2. AN OPEN SESSION WAS ONLY VISIBLE ON THE DAY IT STARTED. getActiveStudents
//     required `date = today AND status = 'active'`, and timeOut/autoScan looked
//     for today's row to close. A session that crossed midnight therefore became
//     invisible AND unclosable -- the student was told "No active session found.
//     Please time in first." while standing in the lab.
//
// The clock is injected so these assertions do not depend on the time of day the
// suite happens to run -- which is exactly how the original bug stayed hidden.
//
// Run: node tests/attendanceClock.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";
process.env.SCHOOL_TIMEZONE = "Asia/Manila";

// Load the real schoolClock with a controlled host timezone, so the assertions
// hold regardless of the machine running the suite. Without this the suite would
// pass on a laptop set to Asia/Manila and fail on CI in UTC -- the same blind
// spot that hid the original bug.
const REAL_TZ = process.env.TZ;
process.env.TZ = "UTC";
const { todayKey, weekStartKey, dayKey, formatTimeInTz, TIMEZONE } = require("../src/utils/schoolClock");
process.env.TZ = REAL_TZ;

// --- Controller, against a stubbed Supabase + Firestore -------------------
const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

let rows = [];
let pendingPatch = null;

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: () => {
        // Each query gets its OWN working copy. Sharing one module-level array
        // across chains made concurrent queries (getStats fires three at once)
        // trample each other's filters, which is a bug in the stub, not in the
        // controller.
        let working = [...rows];
        const chain = {
          select: () => chain,
          eq: (k, v) => { working = working.filter((r) => String(r[k]) === String(v)); return chain; },
          gte: (k, v) => { working = working.filter((r) => String(r[k]) >= String(v)); return chain; },
          lte: (k, v) => { working = working.filter((r) => String(r[k]) <= String(v)); return chain; },
          update: (patch) => { pendingPatch = patch; return chain; },
          insert: () => chain,
          then: (resolve) => resolve({ data: working, error: null }),
        };
        return chain;
      },
    },
  },
};

const STUDENT = {
  firstName: "Ana",
  lastName: "Reyes",
  schoolId: "23-000039",
  course: "BIT",
  year: "4th Year",
  section: "4B",
};

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: {},
    db: {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({ empty: false, size: 1, docs: [{ id: "u9", data: () => ({ ...STUDENT }) }] }),
          }),
        }),
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ ...STUDENT }) }) }),
      }),
    },
    auth: {},
  },
};

const { getActiveStudents, getStats, timeOut, timeIn } = require("../src/controllers/attendanceController");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

/**
 * Shift a YYYY-MM-DD key by whole days.
 *
 * The session assertions have to be written against a RELATIVE today. Pinning
 * them to a literal date means the suite quietly starts failing the day after it
 * is written -- and worse, starts PASSING for the wrong reason if the real "today"
 * happens to equal the fixture. Every fixture below is derived from this.
 */
function shiftDay(dayKeyString, days) {
  const [y, m, d] = dayKeyString.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

const TODAY = todayKey();
const YESTERDAY = shiftDay(TODAY, -1);
const OLDER = shiftDay(TODAY, -3);

// An instant that falls on the given school-local day, safely mid-afternoon so no
// assertion can be perturbed by an offset boundary.
const instantOn = (dayKeyString) => new Date(`${dayKeyString}T06:00:00.000Z`);

const rec = (o) => ({
  id: "r1",
  student_school_id: STUDENT.schoolId,
  first_name: STUDENT.firstName,
  last_name: STUDENT.lastName,
  course: STUDENT.course,
  year: STUDENT.year,
  section: STUDENT.section,
  subject: "Net 1",
  professor: "Dela Cruz",
  lab_room: "CET CENTER",
  room_code: "cet-center",
  date: TODAY,
  time_in: instantOn(TODAY).toISOString(),
  time_out: null,
  total_duration: null,
  status: "active",
  ...o,
});

async function callActive(query = {}) {
  rows = SEED;
  const res = mkRes();
  await getActiveStudents({ query, user: { uid: "u1" } }, res);
  return res.body;
}

async function callStats() {
  rows = SEED;
  const res = mkRes();
  await getStats({ query: {}, user: { uid: "u1" } }, res);
  return res.body;
}

let SEED = [];

(async () => {
  console.log("--- the school clock, not the host clock ---");
  check("timezone is the configured one", TIMEZONE, "Asia/Manila");

  // 17:30 UTC on Oct 3 is 01:30 on Oct 4 in Manila. Under the old host-clock
  // code this returned "2026-10-03" -- the day BEFORE the scan happened.
  check("01:30 on Oct 4 PHT is Oct 4, not Oct 3", todayKey(new Date("2026-10-03T17:30:00.000Z")), "2026-10-04");
  check("just before local midnight", todayKey(new Date("2026-10-03T15:59:59.000Z")), "2026-10-03");
  check("just after local midnight", todayKey(new Date("2026-10-03T16:00:00.000Z")), "2026-10-04");
  check("local noon", todayKey(new Date("2026-10-04T04:00:00.000Z")), "2026-10-04");
  check("a late-evening scan is same-day locally", todayKey(new Date("2026-10-04T14:00:00.000Z")), "2026-10-04");
  check("dayKey accepts a Date", dayKey(new Date("2026-10-04T02:00:00.000Z")), "2026-10-04");

  console.log("--- midnight is 00:xx, never 24:xx ---");
  // Some ICU builds report hour 24 for midnight with hour12:false. Left
  // unhandled it would corrupt the date component.
  check("local midnight", todayKey(new Date("2026-10-03T16:05:00.000Z")), "2026-10-04");

  console.log("--- the week starts on the school-time Sunday ---");
  // 2026-10-04 is a Sunday. The old code took local midnight then sliced it with
  // toISOString(), which on a UTC host produced the PREVIOUS day's key and
  // silently widened the "This Week" window by a day.
  check("Sunday", weekStartKey(new Date("2026-10-04T02:00:00.000Z")), "2026-10-04");
  check("Monday rolls back to the 4th", weekStartKey(new Date("2026-10-05T02:00:00.000Z")), "2026-10-04");
  check("Saturday still rolls back to the 4th", weekStartKey(new Date("2026-10-10T02:00:00.000Z")), "2026-10-04");
  check("Sunday 23:30 PHT", weekStartKey(new Date("2026-10-04T15:30:00.000Z")), "2026-10-04");

  console.log("--- exported wall-clock times are school time, not server time ---");
  // A 09:00 PHT scan is 01:00 UTC. The workbook used to print 01:00 AM.
  check("formats in school time", formatTimeInTz("2026-10-04T01:00:00.000Z"), "09:00 AM");
  check("blank stays blank", formatTimeInTz(null), "");
  check("garbage stays blank", formatTimeInTz("not-a-date"), "");

  console.log("--- an open session is open, whatever day it started ---");
  SEED = [
    rec({ id: "today", date: TODAY }),
    // Stranded: scanned in late on the previous day, never signed out.
    rec({ id: "overnight", date: YESTERDAY, time_in: instantOn(YESTERDAY).toISOString() }),
    rec({
      id: "closed",
      date: YESTERDAY,
      time_in: instantOn(YESTERDAY).toISOString(),
      time_out: instantOn(YESTERDAY).toISOString(),
      total_duration: 60,
      status: "timed_out",
    }),
  ];

  const active = await callActive();
  // Oldest first: the row that has been open longest is the one needing attention.
  check("both open sessions are listed", active.map((r) => r.id), ["overnight", "today"]);
  check("the closed one is not", active.some((r) => r.id === "closed"), false);
  check("stale flag set only on the old one", active.map((r) => !!r.staleSession), [true, false]);
  check("elapsed time is computed for the overnight one", typeof active[0].currentDuration, "number");

  const stats = await callStats();
  check("the KPI counts every open session", stats.currentlyInside, 2);
  check("and reports how many are leftovers", stats.staleInside, 1);
  check("today's sessions exclude the overnight row", stats.totalToday, 1);

  console.log("--- a long-stranded session is still visible, not quietly dropped ---");
  // A row left open for days is the worst case: the student is long gone, but the
  // session should still be on the board so an admin can close it.
  SEED = [
    rec({ id: "today", date: TODAY }),
    rec({ id: "ancient", date: OLDER, time_in: instantOn(OLDER).toISOString() }),
  ];
  const staleOnly = await callActive();
  check("listed alongside today's", staleOnly.map((r) => r.id), ["ancient", "today"]);
  check("flagged as not signed out", staleOnly.find((r) => r.id === "ancient").staleSession, true);
  check("and counted as a leftover", (await callStats()).staleInside, 1);

  console.log("--- the room filter still narrows the live list ---");
  const otherRoom = await callActive({ room: "net-lab" });
  check("a room with nobody in is empty", otherRoom.length, 0);
  // Matched by name, not by the stored code, to pin that the room filter keeps
  // normalising rather than comparing room_code literally.
  const matchingRoom = await callActive({ room: "CET CENTER" });
  check("the occupied room still resolves", matchingRoom.length, 2);

  console.log("--- a stranded session can actually be signed out ---");
  // The symptom this fixes: the kiosk refused with "No active session found.
  // Please time in first." for a student who was standing right there. Seeded
  // with ONLY the stranded row, which is the real scenario -- nobody has a
  // same-day session because they have been inside since yesterday.
  rows = [rec({ id: "overnight", date: YESTERDAY, time_in: instantOn(YESTERDAY).toISOString() })];
  pendingPatch = null;
  const outRes = mkRes();
  await timeOut({ body: { schoolId: STUDENT.schoolId, roomCode: "cet-center" } }, outRes);
  check("sign-out succeeds", outRes.statusCode, 200);
  check("and closes the stranded session", outRes.body?.record?.id, "overnight");
  check("writing timed_out with a duration", [pendingPatch?.status, typeof pendingPatch?.total_duration], ["timed_out", "number"]);

  console.log("--- when several are open, today's is the one closed ---");
  // Otherwise the kiosk picks arbitrarily among leftovers and can close the
  // wrong session, silently ending a visit the student never finished.
  rows = [...SEED];
  const pickRes = mkRes();
  await timeOut({ body: { schoolId: STUDENT.schoolId, roomCode: "cet-center" } }, pickRes);
  check("today's session wins", pickRes.body?.record?.id, "today");

  console.log("--- a second sign-in is refused while any session is open ---");
  // Otherwise the guard silently stopped protecting, and duplicate open rows
  // accumulated one per scan.
  rows = [rec({ id: "overnight", date: YESTERDAY, time_in: instantOn(YESTERDAY).toISOString() })];
  const inRes = mkRes();
  await timeIn({ body: { schoolId: STUDENT.schoolId, subject: "Net 1", professor: "Dela Cruz", labRoom: "CET CENTER", roomCode: "cet-center" } }, inRes);
  check("refused", inRes.statusCode, 400);
  check("and the message names the day they are stuck on", inRes.body?.error, `Already timed in from ${YESTERDAY}. Please time out first.`);

  console.log("--- a same-day open session uses the short message ---");
  rows = [rec({ id: "today" })];
  const inRes2 = mkRes();
  await timeIn({ body: { schoolId: STUDENT.schoolId, subject: "Net 1", professor: "Dela Cruz", labRoom: "CET CENTER", roomCode: "cet-center" } }, inRes2);
  check("refused", inRes2.statusCode, 400);
  check("without a confusing date", inRes2.body?.error, "Already timed in. Please time out first.");

  console.log("--- sign-out with nothing open still explains itself ---");
  rows = [rec({ id: "closed", status: "timed_out", time_out: instantOn(TODAY).toISOString(), total_duration: 60 })];
  const noneRes = mkRes();
  await timeOut({ body: { schoolId: STUDENT.schoolId, roomCode: "cet-center" } }, noneRes);
  check("refused", noneRes.statusCode, 400);
  check("with the original guidance", noneRes.body?.error, "No active session found. Please time in first.");

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();