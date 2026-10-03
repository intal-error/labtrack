// Verifies room create/update, with one question as the point of the file:
// does renaming a room keep its attendance history reachable?
//
// WHY THIS FILE EXISTS: updateRoom used to regenerate room_code (and qr_data)
// from the new name. That is doubly destructive, because the kiosk derives
// room_code by slugifying the name embedded in the QR payload
// (AttendanceKioskPage.jsx:144) rather than looking lab_rooms up:
//
//   · the regenerated key orphaned every prior lab_attendance row
//   · AND newly scanned students were written under the NEW key while the room
//     still pointed at the OLD one
//
// So a rename split the room's attendance permanently, with no recovery path in
// the UI -- the page and its export simply showed post-rename rows only. A rename
// is now display-only.
//
// The suites need a writable lab_rooms because updateRoom mutates it, so this
// one stubs the client with an in-memory table instead of a frozen array.
// Fully offline: Supabase and Firebase are stubbed before the controller loads.
//
// Run: node tests/roomCrud.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

// Mutable, so an update is observable.
const db = {
  rooms: [
    { id: "room-cet", room_name: "CET CENTER", room_code: "cet-center", qr_data: "LABROOM:CET CENTER", location: "Building A", status: "active" },
    { id: "room-net", room_name: "NET LAB", room_code: "net-lab", qr_data: "LABROOM:NET LAB", location: "Building B", status: "active" },
  ],
  // Attendance rows keep the room_code that was current when they were written.
  attendance: [
    { id: "a1", room_code: "net-lab", lab_room: "NET LAB", course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Dela Cruz", date: "2026-09-30", total_duration: 2, status: "timed_out", student_school_id: "23-1" },
    { id: "a2", room_code: "net-lab", lab_room: "NET LAB", course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Dela Cruz", date: "2026-09-28", total_duration: 6, status: "timed_out", student_school_id: "23-2" },
    { id: "b1", room_code: "cet-center", lab_room: "CET CENTER", course: "BIT", year: "4th Year", section: "4A", subject: "Net 2", professor: "Santos", date: "2026-09-27", total_duration: 8, status: "timed_out", student_school_id: "23-3" },
  ],
};

const resetDb = () => {
  db.rooms = [
    { id: "room-cet", room_name: "CET CENTER", room_code: "cet-center", qr_data: "LABROOM:CET CENTER", location: "Building A", status: "active" },
    { id: "room-net", room_name: "NET LAB", room_code: "net-lab", qr_data: "LABROOM:NET LAB", location: "Building B", status: "active" },
  ];
  db.attendance = [
    { id: "a1", room_code: "net-lab", lab_room: "NET LAB", course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Dela Cruz", date: "2026-09-30", total_duration: 2, status: "timed_out", student_school_id: "23-1" },
    { id: "a2", room_code: "net-lab", lab_room: "NET LAB", course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Dela Cruz", date: "2026-09-28", total_duration: 6, status: "timed_out", student_school_id: "23-2" },
    { id: "b1", room_code: "cet-center", lab_room: "CET CENTER", course: "BIT", year: "4th Year", section: "4A", subject: "Net 2", professor: "Santos", date: "2026-09-27", total_duration: 8, status: "timed_out", student_school_id: "23-3" },
  ];
};

// Minimal in-memory PostgREST: enough for select/eq/neq/insert/update/single/maybeSingle.
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        const isRooms = table === "lab_rooms";
        const source = () => (isRooms ? db.rooms : db.attendance);
        let rows = [...source()];
        const pending = [];

        const applyEq = (k, v, negate) => {
          rows = rows.filter((r) => (String(r[k]) === String(v)) !== Boolean(negate));
        };

        // Applies queued writes to the real backing arrays exactly once.
        const flush = () => {
          while (pending.length) {
            const op = pending.shift();
            if (op.type === "insert") source().push(op.record);
            if (op.type === "update") {
              for (const row of source()) {
                if (op.ids.includes(row.id)) Object.assign(row, op.patch);
              }
            }
          }
        };

        const chain = {
          select: () => chain,
          eq: (k, v) => {
            applyEq(k, v, false);
            return chain;
          },
          neq: (k, v) => {
            applyEq(k, v, true);
            return chain;
          },
          limit: () => chain,
          // Writes are queued and applied on read. single()/maybeSingle() count
          // as reads: createRoom ends in .insert().select().single(), so
          // flushing only in then() would never run the insert and the created
          // row would silently not exist.
          single: () => {
            flush();
            return Promise.resolve({ data: rows[0] || null, error: null });
          },
          maybeSingle: () => {
            flush();
            return Promise.resolve({ data: rows[0] || null, error: null });
          },
          insert: (record) => {
            pending.push({ type: "insert", record });
            return chain;
          },
          update: (patch) => {
            pending.push({ type: "update", patch, ids: rows.map((r) => r.id) });
            return chain;
          },
          then: (resolve) => {
            flush();
            return resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
    },
  },
};

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    admin: {},
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const { createRoom, updateRoom } = require("../src/controllers/attendanceController");
const { getRoomAttendanceHistory } = require("../src/controllers/attendanceController");
const { normRoom } = require("../src/utils/attendanceFilters");

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

const callCreate = async (body) => {
  const res = makeRes();
  await createRoom({ body }, res);
  return res;
};
const callUpdate = async (id, body) => {
  const res = makeRes();
  await updateRoom({ params: { id }, body }, res);
  return res;
};
const history = async (roomId) => {
  const res = makeRes();
  await getRoomAttendanceHistory({ params: { roomId }, query: {} }, res);
  return res;
};

// The kiosk's own slugify, copied from AttendanceKioskPage.jsx:144. Duplicated
// on purpose: it is the contract that makes room_code frozen-on-rename
// necessary, so the test should assert against that exact expression.
const kioskSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

(async () => {
  console.log("--- rename keeps the join key frozen ---");
  resetDb();
  let before = (await history("room-net")).body;
  check("NET LAB history is reachable before the rename", before.total, 2);

  const renamed = await callUpdate("room-net", { roomName: "Networking Lab" });
  check("rename succeeds", renamed.statusCode, 200);
  check("room_name updates", renamed.body.roomName, "Networking Lab");

  let after = (await history("room-net")).body;
  check("room_code is unchanged by the rename", after.total, 2);
  check("history survives the rename", after.records.map((r) => r.id), ["a1", "a2"]);
  check("display name reflects the rename", after.roomName, "Networking Lab");

  console.log("--- the join key survives as a stored value ---");
  resetDb();
  await callUpdate("room-net", { roomName: "Networking Lab" });
  const stored = db.rooms.find((r) => r.id === "room-net");
  check("stored room_code still the original slug", stored.room_code, "net-lab");
  check("stored qr_data still encodes the original name", stored.qr_data, "LABROOM:NET LAB");

  console.log("--- future scans still join the frozen key ---");
  // This is the half that made regenerating the code doubly destructive: the QR
  // payload is what the kiosk slugs, so a frozen qr_data keeps new rows joining
  // the room the history is under.
  const scannedName = stored.qr_data.replace("LABROOM:", "");
  check("kiosk slug from the frozen QR matches the stored code", kioskSlug(scannedName), stored.room_code);
  check("a hypothetical new scan would join this room's history",
    db.attendance.filter((r) => normRoom(r.room_code) === normRoom(stored.room_code)).length, 2);

  console.log("--- renaming to the same name is a no-op, not a break ---");
  resetDb();
  const same = await callUpdate("room-net", { roomName: "NET LAB" });
  check("same-name rename succeeds", same.statusCode, 200);
  check("history intact after same-name rename", (await history("room-net")).body.total, 2);

  console.log("--- rename cannot collide with another room ---");
  resetDb();
  const clash = await callUpdate("room-net", { roomName: "CET CENTER" });
  check("renaming onto an existing name is refused", clash.statusCode, 400);
  check("the refusal explains why", clash.body.error, "A room with this name already exists");
  check("the original name is untouched after a refused rename", db.rooms.find((r) => r.id === "room-net").room_name, "NET LAB");

  console.log("--- blank rename is refused ---");
  resetDb();
  const blank = await callUpdate("room-net", { roomName: "   " });
  check("blank name is refused", blank.statusCode, 400);

  console.log("--- non-name updates are unaffected ---");
  resetDb();
  const loc = await callUpdate("room-net", { location: "Building C" });
  check("location update succeeds", loc.statusCode, 200);
  check("location updated", loc.body.location, "Building C");
  check("room_code untouched by a location change", db.rooms.find((r) => r.id === "room-net").room_code, "net-lab");
  check("history intact after a location change", (await history("room-net")).body.total, 2);

  console.log("--- unslugifiable room names are refused at creation ---");
  resetDb();
  for (const bad of ["!!!", "###", "   ...   ", "-"]) {
    const r = await callCreate({ roomName: bad });
    check(`rejects ${JSON.stringify(bad)}`, r.statusCode, 400);
  }
  check("the rejection explains the requirement",
    (await callCreate({ roomName: "###" })).body.error, "Room name must contain at least one letter or number");

  console.log("--- a normal room is still creatable ---");
  resetDb();
  const ok = await callCreate({ roomName: "Comp Lab 3", location: "Building D" });
  check("create succeeds", ok.statusCode, 200);
  check("slug derived on create", db.rooms.find((r) => r.room_name === "Comp Lab 3").room_code, "comp-lab-3");
  check("qr payload uses the name", db.rooms.find((r) => r.room_name === "Comp Lab 3").qr_data, "LABROOM:Comp Lab 3");

  console.log("--- a stored room with an unusable identifier fails closed ---");
  resetDb();
  db.rooms.push({ id: "room-bad", room_name: "???", room_code: "", qr_data: "LABROOM:???", location: null, status: "active" });
  const bad = await history("room-bad");
  check("empty room_code returns 400 rather than every room-less row", bad.statusCode, 400);
  check("and explains how to fix it", bad.body.error.includes("Rename it"), true);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
