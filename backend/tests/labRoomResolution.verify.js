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

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        const source = () => (table === "lab_rooms" ? rooms : []);
        let rows = [...source()];
        let key = null; let value = null;
        const chain = {
          select: () => chain,
          eq: (k, v) => { key = k; value = v; rows = rows.filter((r) => String(r[key]) === String(value)); return chain; },
          limit: () => chain,
          insert: (record) => { inserted.push({ ...record }); return chain; },
          update: (patch) => { updated.push({ ...patch }); return chain; },
          single: () => Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }),
          maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
          then: (resolve) => resolve({ data: rows, error: null }),
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

const { timeIn } = require("../src/controllers/attendanceController");

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

  console.log("--- an unknown room code falls back rather than blocking the scan ---");
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "Some Field Lab", roomCode: "unknown-room" } }, res);
  check("time-in still succeeds", res.statusCode, 200);
  check("lab_room falls back to the supplied name", inserted[0].lab_room, "Some Field Lab");
  check("room_code is preserved for later matching", inserted[0].room_code, "unknown-room");

  console.log("--- no room code at all still records a room ---");
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "Manual Entry" } }, res);
  check("time-in succeeds", res.statusCode, 200);
  check("lab_room preserved", inserted[0].lab_room, "Manual Entry");
  check("room_code empty rather than undefined", inserted[0].room_code, "");

  console.log("--- a blank labRoom is rejected before any lookup ---");
  inserted.length = 0;
  res = makeRes();
  await timeIn({ body: { schoolId: "23-000039", subject: "Net 1", professor: "Dela Cruz", labRoom: "", roomCode: "net-lab" } }, res);
  check("blank room is rejected", res.statusCode, 400);
  check("and nothing was written", inserted.length, 0);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
