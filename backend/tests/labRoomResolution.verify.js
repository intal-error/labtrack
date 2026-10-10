// Verifies that lab_attendance.lab_room stores the CURRENT room name, resolved
// server-side from lab_rooms, rather than whatever name the scanned QR carried.
//
// WHY THIS FILE EXISTS: freezing room_code/qr_data on rename is what keeps a
// room's history joinable (see roomCrud.verify.js). But the kiosk derives BOTH
// labRoom and roomCode from the name inside the QR payload
// (AttendanceKioskPage.jsx:143-144), and that payload is now the room's
// ORIGINAL name. Storing it verbatim therefore stamped every future record with
// a stale room name, which surfaced in the Today's Log Room column, the student
// cards, the student attendance panel and the dashboard.
//
// So: room_code stays the stable join key, lab_room is looked up fresh.
//
// Run: node tests/labRoomResolution.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

// The room has been RENAMED, so its stored name is current while its frozen QR
// payload still carries the original. That divergence is exactly the case.
const rooms = [{ id: "room-net", room_name: "Networking Lab", room_code: "net-lab", qr_data: "LABROOM:NET LAB" }];

const inserted = [];
const updated = [];

// lab_attendance rows. timeOut CLOSES the open session, so the same-room assertions need a
// mutable table rather than a fixed one -- "a refusal leaves the session open" is only
// checkable against a row that could have been modified.
const dbOpen = [];

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        // This stub keeps ONE key/value pair, so a second eq() overwrites the first
        // predicate. timeOut's open-session query is exactly `eq(...).eq(...).order(
        // ...).limit(1)`, so the last eq (status=active) is what actually filters --
        // which is why every row seeded below carries status "active".
        const source = () => (table === "lab_rooms" ? rooms : table === "lab_attendance" ? dbOpen : []);
        let rows = [...source()];
        let key = null; let value = null;
        const chain = {
          select: () => chain,
          eq: (k, v) => { key = k; value = v; rows = rows.filter((r) => String(r[key]) === String(value)); return chain; },
          // timeIn now asks for the open session and today's newest row with
          // .order().limit(1) instead of reading every row for the student, so the
          // stub has to honour ordering for the "no open session yet" case to still
          // resolve. lab_attendance is empty in this suite, so ordering is a no-op
          // here -- but an unimplemented .order() would be an own-property undefined,
          // which the controller calls directly.
          order: () => chain,
          limit: () => chain,
          insert: (record) => { inserted.push({ ...record }); return chain; },
          update: (patch) => { updated.push({ ...patch }); chain._patch = patch; return chain; },
          single: () => Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }),
          maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
          // The patch is APPLIED, not just recorded. Without this the "a refused sign-out
          // leaves the session open" assertions would pass vacuously -- status could never
          // change, so they would be true whether or not the handler had tried to close it.
          then: (resolve) => {
            if (chain._patch) {
              const patch = chain._patch;
              for (const r of rows) Object.assign(r, patch);
              chain._patch = null;
              return Promise.resolve({ data: null, error: null }).then(resolve);
            }
            return resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
    },
  },
};

const studentDoc = {
  exists: true,
  id: "user-1",
  data: () => ({ firstName: "Ann", lastName: "Aguilar", schoolId: "23-000039", course: "BIT", year: "4th Year", section: "4B" }),
};

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: {},
    db: {
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [studentDoc] }) }) }),
        doc: () => ({ get: async () => ({ exists: false }) }),
      }),
    },
    auth: {},
  },
};

const { timeIn, timeOut } = require("../src/controllers/attendanceController");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

(async () => {
  // The kiosk sends the name from the QR, which is FROZEN and therefore stale.
  const staleName = rooms[0].qr_data.replace("LABROOM:", "");

  console.log("--- lab_room is resolved from lab_rooms, not taken from the QR ---");
  inserted.length = 0;
  let res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: staleName, roomCode: "net-lab" } }, res);
  check("time-in succeeded", res.statusCode, 200);
  check("lab_room stores the CURRENT room name", inserted[0].lab_room, "Networking Lab");
  check("room_code keeps the frozen join key", inserted[0].room_code, "net-lab");

  console.log("--- the two diverge exactly as intended after a rename ---");
  check("the name sent by the kiosk is the stale one", staleName, "NET LAB");
  check("what is stored differs from what was sent", inserted[0].lab_room !== staleName, true);
  check("but both still resolve to the same room",
    String(inserted[0].room_code).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "net-lab");

  console.log("--- an unknown room code is REJECTED, not fallen back from ---");
  // BEHAVIOUR CHANGE (approved requirement: "Require the submitted room code to resolve
  // to a real laboratory-room record. Reject invalid room codes").
  //
  // This used to assert the opposite -- that an unrecognised code still produced a
  // session using the name supplied in the request. That leniency was a write-integrity
  // hole: roomCode was never checked, so the logbook accumulated rows for rooms that do
  // not exist, and the Admin reviewing their laboratory could not trust what they saw.
  // resolveLabRoom's fallback is retained for read/display paths, but an attendance ROW
  // may now only ever name a room that exists.
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "Some Field Lab", roomCode: "unknown-room" } }, res);
  check("time-in is refused", res.statusCode, 404);
  check("no row was written", inserted.length, 0);

  console.log("--- a QR name that is stale after a rename is still accepted ---");
  // The counterpart rule: rejecting the scanner's name would break every kiosk in a
  // renamed room, so the mismatch is ignored and the stored name follows lab_rooms.
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "Totally Wrong Name", roomCode: "net-lab" } }, res);
  check("time-in still succeeds", res.statusCode, 200);
  check("stored name follows lab_rooms, not the QR", inserted[0].lab_room, "Networking Lab");

  console.log("--- no room code at all is now refused ---");
  // Previously this wrote lab_room "Manual Entry" from the request body. Under the
  // approved rule that an attendance row may only name a room that exists, a scan with
  // no room code has nothing to resolve against and is rejected. Both entry points
  // (kiosk QR and student QR) always carry a room code, so nothing legitimate loses
  // this path -- and "Manual Entry" as an unvalidated free-text room name is exactly
  // what let bogus rooms into the logbook.
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "Manual Entry" } }, res);
  check("time-in is refused without a room code", res.statusCode, 404);
  check("nothing was written", inserted.length, 0);

  console.log("--- a blank labRoom is no longer required, and no longer trusted ---");
  // BEHAVIOUR CHANGE. labRoom used to be mandatory, so a scan with an empty name was
  // refused with 400. It is not required any more, and that is deliberate: the name is
  // now always taken from lab_rooms via room_code, so whatever the scanner sends is
  // ignored. Requiring it would add a failure mode (the name is FROZEN in the QR and goes
  // stale the moment an Admin renames a room) while protecting nothing.
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "", roomCode: "net-lab" } }, res);
  check("time-in succeeds with a blank room name", res.statusCode, 200);
  check("the name came from lab_rooms regardless", inserted[0].lab_room, "Networking Lab");

  // ---------------------------------------------------------------- same-room sign-out
  console.log("--- timeOut: the same-room rule, on the timeOut handler ---");
  // The printed QR identifies the laboratory where the session started, so only that
  // room's QR may close it. These assert the rule AND that a refusal leaves the session
  // open -- "a refused request must not close anything" is the property that matters, and
  // it is invisible if you only check the status code.
  const seedOpenSession = (sid, roomCode, roomName) => {
    dbOpen.push({
      id: "open-1",
      student_school_id: sid,
      room_code: roomCode,
      lab_room: roomName,
      date: "2026-01-01",
      time_in: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      // Explicitly null, so "no time_out was written" is a real assertion rather than a
      // comparison against `undefined` for a key that was never there.
      time_out: null,
      total_duration: null,
      status: "active",
    });
  };

  console.log("--- signing out at the room where the session started closes it ---");
  dbOpen.length = 0;
  seedOpenSession("23-000039", "net-lab", "Networking Lab");
  res = makeRes();
  await timeOut({ body: { schoolId: "23-000039", roomCode: "net-lab" } }, res);
  check("sign-out succeeds", res.statusCode, 200);
  check("  the session is closed", dbOpen[0].status, "timed_out");
  check("  with a duration recorded", typeof dbOpen[0].total_duration, "number");

  console.log("--- forgetting the door QR is refused and the session STAYS OPEN ---");
  dbOpen.length = 0;
  seedOpenSession("23-000039", "net-lab", "Networking Lab");
  res = makeRes();
  await timeOut({ body: { schoolId: "23-000039" } }, res);
  check("no room code -> 400", res.statusCode, 400);
  check("  the message names the room to scan", /Networking Lab/.test(res.body.error), true);
  check("  the session is still active", dbOpen[0].status, "active");
  check("  and no time_out was written", dbOpen[0].time_out, null);

  console.log("--- another room's QR cannot close the session ---");
  dbOpen.length = 0;
  seedOpenSession("23-000039", "net-lab", "Networking Lab");
  res = makeRes();
  await timeOut({ body: { schoolId: "23-000039", roomCode: "systems-lab" } }, res);
  check("a different room -> 400", res.statusCode, 400);
  check("  the message names the correct room", /Networking Lab/.test(res.body.error), true);
  check("  the session is still active", dbOpen[0].status, "active");
  check("  and no time_out was written", dbOpen[0].time_out, null);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
