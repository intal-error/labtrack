/*
 * autoScan -- the endpoint that had NO coverage and was returning 500.
 *
 * WHY THIS FILE EXISTS
 *
 * autoScan is mounted on POST /api/attendance/auto-scan behind
 * authorize("kiosk","student") (server.js), so it was reachable by any authenticated
 * kiosk or student while not a single line of the app called it -- api.js:434 defines a
 * client helper, but no component invokes it, and tests/attendanceClock.verify.js only
 * mentioned autoScan in comments (L12, L60). That combination is what let a
 * ReferenceError sit there unnoticed: `resolveAttendanceSubject(req, res, schoolId)`
 * referenced a `schoolId` that an earlier edit had removed from the destructure, so every
 * call threw and was swallowed by the catch into a 500. Nothing failed because nothing
 * exercised it.
 *
 * It also silently carried three behaviours the other two write paths no longer had:
 *   - no room requirement (it accepted a missing roomCode that timeIn rejects with 404)
 *   - room name taken from the CLIENT via resolveLabRoom's fail-soft fallback
 *   - `year` and `section` taken straight from the request body while name and course
 *     were overridden from the profile -- so a student could file a record claiming any
 *     year level
 *
 * WHAT IS PINNED HERE
 *
 * 1. A valid room QR is mandatory, and the stored room name comes from lab_rooms.
 * 2. The client's room name is ignored even when it disagrees.
 * 3. A student records only for themselves.
 * 4. year/section/name/course come from the server-side profile when it has them, and
 *    fall back to the typed value when it does not (kiosk with no profile).
 * 5. Same-room sign-out: correct room closes it; no code or a different room is refused
 *    AND LEAVES THE SESSION OPEN.
 * 6. Every rejected request leaves lab_attendance untouched -- no create, no modify, no
 *    close.
 *
 * STUBBED OR REAL: everything here is STUBBED. Firebase is a hand-rolled fake and
 * Supabase is an in-memory chain defined below. No Firebase project is contacted. See
 * tests/apiAuthz.verify.js for the mounted-app suite, which runs the real middleware
 * chain over the same kind of stubs.
 */

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

// Room "net-lab" is owned by CT. A visitor from MT will be scanning in here, which is the
// cross-course case the whole design allows -- see the note in utils/roomScope.js.
const rooms = [
  { id: "room-net", room_code: "net-lab", room_name: "Networking Lab", course: "CT" },
  { id: "room-mt", room_code: "mt-lab", room_name: "Systems Lab", course: "MT" },
];

// lab_attendance is mutable here because autoScan's sign-out branch CLOSES a row, and
// "a refused request must not close it" is only meaningful against a real prior row.
const attendance = [];

const tableFor = (table) => (table === "lab_rooms" ? rooms : table === "lab_attendance" ? attendance : null);

// A chain whose filters ACCUMULATE. The earlier version of this stub kept a single
// key/value pair, so `eq(a).eq(b)` silently dropped the first predicate -- which would
// have made the open-session lookup match rows it should not, and quietly turned the
// sign-out assertions into tautologies.
const makeChain = (table) => {
  const filters = [];
  let orderField = null;
  let limitN = null;
  const matches = (r) => filters.every((f) => String(r[f.k]) === String(f.v));
  const selected = () => {
    let rows = tableFor(table).filter(matches);
    if (orderField) {
      rows = [...rows].sort((a, b) => String(a[orderField] ?? "").localeCompare(String(b[orderField] ?? "")));
    }
    if (limitN != null) rows = rows.slice(0, limitN);
    return rows;
  };
  const chain = {
    _table: table,
    select: () => chain,
    eq: (k, v) => {
      filters.push({ k, v });
      return chain;
    },
    neq: (k, v) => {
      filters.push({ k, v, ne: true });
      return chain;
    },
    order: (f) => {
      orderField = f;
      return chain;
    },
    limit: (n) => {
      limitN = n;
      return chain;
    },
    insert: (record) => {
      const row = { ...record };
      tableFor(table).push(row);
      chain._inserted = row;
      return chain;
    },
    update: (patch) => {
      chain._patch = patch;
      return chain;
    },
    single: () => {
      if (chain._inserted) return Promise.resolve({ data: chain._inserted, error: null });
      return Promise.resolve({ data: selected()[0] || null, error: null });
    },
    then: (resolve) => {
      // A trailing .update({...}).eq("id", x) applies the patch to matching rows and
      // yields no rows back, exactly like PostgREST.
      if (chain._patch) {
        const patch = chain._patch;
        for (const r of selected()) Object.assign(r, patch);
        chain._patch = null;
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      return Promise.resolve({ data: selected(), error: null }).then(resolve);
    },
  };
  return chain;
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { supabase: { from: (table) => makeChain(table) } },
};

// The profile is looked up by schoolId; `profile` is swapped per scenario so a test can
// simulate missing fields, or a missing profile entirely.
let profile = null;

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    admin: {},
    db: {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: async () => (profile ? { empty: false, docs: [profile] } : { empty: true }),
          }),
        }),
        doc: () => ({ get: async () => ({ exists: false }) }),
      }),
    },
    auth: {},
  },
};

const { autoScan } = require("../src/controllers/attendanceController");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
};

const reset = () => {
  attendance.length = 0;
};

const req = (body, user, prof) => ({ body, user, profile: prof });

const STUDENT_MT = { uid: "u-mt", role: "student" };
const KIOSK = { uid: "u-kiosk", role: "kiosk" };

const mtProfileData = {
  firstName: "Dana",
  lastName: "Reyes",
  schoolId: "23-000777",
  course: "MT",
  year: "3rd Year",
  section: "3A",
};
const fullProfile = { exists: true, id: "u-mt", data: () => mtProfileData };

const form = {
  firstName: "Typed",
  lastName: "Name",
  course: "CT",
  year: "1st Year",
  section: "1Z",
  subject: "Net 1",
  professor: "Dela Cruz",
};

// The endpoint only calls timeIn when there is no open session, so a test that wants the
// time-out branch seeds the row the way timeIn would have written it.
const seedOpen = (sid, roomCode, labRoom) => {
  attendance.push({
    id: `row-${attendance.length + 1}`,
    student_school_id: sid,
    room_code: roomCode,
    lab_room: labRoom,
    date: new Date().toISOString().slice(0, 10),
    time_in: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    time_out: null,
    status: "active",
    created_at: new Date().toISOString(),
  });
};

(async () => {
  // ---------------------------------------------------------------- room validation
  console.log("--- a valid room QR is required and its backend name is what gets stored ---");
  reset();
  profile = fullProfile;
  let res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "net-lab" }, KIOSK), res);
  check("time-in succeeds with a valid room code", res.statusCode, 200);
  check("lab_room comes from lab_rooms", attendance[0] && attendance[0].lab_room, "Networking Lab");
  check("room_code is the resolved frozen key", attendance[0] && attendance[0].room_code, "net-lab");

  console.log("--- a room name sent by the client is never trusted ---");
  reset();
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "net-lab", labRoom: "Totally Made Up" }, KIOSK), res);
  check("the bogus client name is ignored", attendance[0] && attendance[0].lab_room, "Networking Lab");

  console.log("--- missing and unknown room codes are both refused ---");
  reset();
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777" }, KIOSK), res);
  check("no room code at all -> 404", res.statusCode, 404);
  check("  and nothing was written", attendance.length, 0);

  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "no-such-room" }, KIOSK), res);
  check("an unknown room code -> 404", res.statusCode, 404);
  check("  and nothing was written", attendance.length, 0);

  // ---------------------------------------------------------------- identity
  console.log("--- a student may record only their own attendance ---");
  reset();
  profile = fullProfile;
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000999", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  check("recording for another student -> 403", res.statusCode, 403);
  check("  and no row was created", attendance.length, 0);

  console.log("--- cross-course: an MT student scanning into a CT-owned room is allowed ---");
  reset();
  profile = fullProfile;
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  check("time-in succeeds", res.statusCode, 200);
  check("  the room's owner is CT", attendance[0] && attendance[0].room_code, "net-lab");
  check("  the student's own course is recorded", attendance[0] && attendance[0].course, "MT");

  // ---------------------------------------------------------------- profile fields
  console.log("--- year, section, name and course come from the profile when it has them ---");
  reset();
  profile = fullProfile;
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  check("year is the profile's, not the body's", attendance[0] && attendance[0].year, "3rd Year");
  check("section is the profile's, not the body's", attendance[0] && attendance[0].section, "3A");
  check("first name is the profile's", attendance[0] && attendance[0].first_name, "Dana");
  check("last name is the profile's", attendance[0] && attendance[0].last_name, "Reyes");
  check("course is the profile's", attendance[0] && attendance[0].course, "MT");

  console.log("--- a profile whose fields are blank falls back to the typed values ---");
  // The kiosk case: the operator types details for someone with an incomplete profile.
  // Fallback must keep working, or legitimate scans start failing.
  reset();
  profile = { exists: true, id: "u-legacy", data: () => ({ firstName: "", lastName: "", schoolId: "23-000123" }) };
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000123", roomCode: "net-lab" }, KIOSK), res);
  check("time-in still succeeds with a blank profile", res.statusCode, 200);
  check("  typed year is kept", attendance[0] && attendance[0].year, "1st Year");
  check("  typed section is kept", attendance[0] && attendance[0].section, "1Z");
  check("  typed course is kept", attendance[0] && attendance[0].course, "CT");

  console.log("--- no profile at all: the kiosk's typed values are used ---");
  reset();
  profile = null;
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000123", roomCode: "net-lab" }, KIOSK), res);
  check("time-in still succeeds with no profile", res.statusCode, 200);
  check("  typed year is kept", attendance[0] && attendance[0].year, "1st Year");
  check("  user_id is blank when there is no profile", attendance[0] && attendance[0].user_id, "");

  console.log("--- a STUDENT with no schoolId on their profile is refused, not guessed ---");
  reset();
  profile = null;
  res = makeRes();
  await autoScan(
    req({ ...form, schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, { firstName: "No", schoolId: "" }),
    res,
  );
  check("time-in -> 403", res.statusCode, 403);
  check("  and no row was created", attendance.length, 0);

  // ---------------------------------------------------------------- same-room sign-out
  console.log("--- signing out from the room where the session started closes it ---");
  reset();
  seedOpen("23-000777", "net-lab", "Networking Lab");
  res = makeRes();
  await autoScan(req({ schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  check("sign-out succeeds", res.statusCode, 200);
  check("  the session is closed", attendance[0].status, "timed_out");
  check("  with a time_out stamped", Boolean(attendance[0].time_out), true);
  check("  and a duration", typeof attendance[0].total_duration, "number");

  console.log("--- forgetting the door QR is refused and the session STAYS OPEN ---");
  reset();
  seedOpen("23-000777", "net-lab", "Networking Lab");
  res = makeRes();
  await autoScan(req({ schoolId: "23-000777" }, STUDENT_MT, mtProfileData), res);
  check("no room code -> 400", res.statusCode, 400);
  check("  the message names the room", /Networking Lab/.test(res.body.error), true);
  check("  the session is still active", attendance[0].status, "active");
  check("  and no time_out was written", attendance[0].time_out, null);

  console.log("--- another room's QR cannot close the session ---");
  reset();
  seedOpen("23-000777", "net-lab", "Networking Lab");
  res = makeRes();
  await autoScan(req({ schoolId: "23-000777", roomCode: "mt-lab" }, STUDENT_MT, mtProfileData), res);
  check("a different room -> 400", res.statusCode, 400);
  check("  the message names the correct room", /Networking Lab/.test(res.body.error), true);
  check("  the session is still active", attendance[0].status, "active");
  check("  and no time_out was written", attendance[0].time_out, null);

  console.log("--- cross-course sign-out: MT student closes a CT-room session ---");
  reset();
  seedOpen("23-000777", "net-lab", "Networking Lab");
  res = makeRes();
  await autoScan(req({ schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  check("sign-out succeeds across courses", res.statusCode, 200);
  check("  and the session closed", attendance[0].status, "timed_out");

  // ---------------------------------------------------------------- integrity
  console.log("--- integrity: rejected requests never create, modify or close ---");
  reset();
  profile = fullProfile;
  res = makeRes();
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), res);
  const snapshot = JSON.stringify(attendance);
  await autoScan(req({ ...form, schoolId: "23-000777", roomCode: "nope" }, STUDENT_MT, mtProfileData), makeRes());
  await autoScan(req({ ...form, schoolId: "someone-else", roomCode: "net-lab" }, STUDENT_MT, mtProfileData), makeRes());
  check("the good row still exists, unchanged", JSON.stringify(attendance), snapshot);
  check("still exactly one row", attendance.length, 1);

  console.log("");
  if (failures) {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("autoScan: all checks passed.");
  process.exit(0);
})();