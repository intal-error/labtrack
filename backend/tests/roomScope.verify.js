/**
 * Verifies room-ownership scoping for the laboratory logbook and room CRUD.
 *
 * WHY ATTENDANCE IS NOT SCOPED BY THE STUDENT'S COURSE: a room is shared. It is
 * used through the day by different courses and subjects, which is the whole point
 * of the logbook ("who used this room, when, for what subject, under which
 * professor"). Scoping by lab_attendance.course would answer a different question
 * and would hide other courses' students from the room's own administrator.
 *
 * So the boundary is who OWNS the room (lab_rooms.course):
 *   - a Course Admin sees the logbook of the rooms their course owns, whoever
 *     scanned in
 *   - a room with no course is Super Admin only, until assigned
 *   - the KIOSK is not scoped at all: it authenticates with a shared secret and
 *     has no user identity to scope by, so any student may log any room
 *
 * Before this, room CRUD was unrestricted -- any admin could create, rename,
 * reassign, delete and PRINT the QR for any room in the building -- and
 * deleteRoom did not even select a course column to check.
 *
 * Run: node backend/tests/roomScope.verify.js
 */

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");
const { applyOr } = require("./helpers/orFilter");
const { todayKey } = require("../src/utils/schoolClock");

const TODAY = todayKey();

const COURSES = ["BIT", "CT", "MT"];

const db = {
  courses: COURSES.map((id) => ({ id, name: id, status: "active" })),
  rooms: [],
  attendance: [],
};

function resetDb() {
  db.courses = COURSES.map((id) => ({ id, name: id, status: "active" }));
  db.rooms = [
    { id: "room-cet", room_name: "CET CENTER", room_code: "cet-center", qr_data: "LABROOM:CET CENTER", location: "Building A", status: "active", course: "CT" },
    { id: "room-net", room_name: "NET LAB", room_code: "net-lab", qr_data: "LABROOM:NET LAB", location: "Building B", status: "active", course: "BIT" },
    // Not yet allocated to a course: Super Admin only until it is.
    { id: "room-shop", room_name: "SHOP FLOOR", room_code: "shop-floor", qr_data: "LABROOM:SHOP FLOOR", location: "Building C", status: "active", course: "" },
  ];
  db.attendance = [
    // CT-owned room, but the student is BIT and the subject is automotive. Still
    // the CT room's logbook.
    { id: "a1", room_code: "cet-center", lab_room: "CET CENTER", course: "BIT", year: "4th Year", section: "4A", subject: "Auto Lab", professor: "Santos", date: TODAY, time_in: `${TODAY}T01:00:00Z`, time_out: null, total_duration: null, status: "active", student_school_id: "23-1" },
    { id: "a2", room_code: "cet-center", lab_room: "CET CENTER", course: "CT", year: "3rd Year", section: "3B", subject: "Prog 1", professor: "Dela Cruz", date: TODAY, time_in: `${TODAY}T02:00:00Z`, time_out: null, total_duration: null, status: "active", student_school_id: "23-2" },
    { id: "b1", room_code: "net-lab", lab_room: "NET LAB", course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Reyes", date: TODAY, time_in: `${TODAY}T03:00:00Z`, time_out: null, total_duration: null, status: "active", student_school_id: "23-3" },
    // An entry whose room_code matches no lab_rooms row at all.
    { id: "orphan", room_code: "gone-lab", lab_room: "OLD LAB", course: "BIT", year: "1st Year", section: "1A", subject: "X", professor: "Y", date: TODAY, time_in: `${TODAY}T04:00:00Z`, time_out: null, total_duration: null, status: "active", student_school_id: "23-4" },
  ];
}

/** In-memory PostgREST with the predicates the controller actually uses. */
function from(table) {
  const source = () =>
    table === "lab_rooms" ? db.rooms
    : table === "lab_attendance" ? db.attendance
    : table === "courses" ? db.courses
    : [];
  let rows = [...source()];
  let headOnly = false;
  const pending = [];

  const flush = () => {
    while (pending.length) {
      const op = pending.shift();
      if (op.type === "insert") source().push(op.record);
      if (op.type === "update") for (const row of source()) if (op.ids.includes(row.id)) Object.assign(row, op.patch);
      if (op.type === "delete") {
        const keep = source().filter((r) => !op.ids.includes(r.id));
        source().splice(0, source().length, ...keep);
      }
    }
  };

  const chain = {
    select(_cols, opts) {
      headOnly = Boolean(opts && opts.head);
      return chain;
    },
    eq(k, v) { rows = rows.filter((r) => String(r[k]) === String(v)); return chain; },
    neq(k, v) { rows = rows.filter((r) => String(r[k]) !== String(v)); return chain; },
    in(k, values) { rows = rows.filter((r) => values.includes(r[k])); return chain; },
    or(expr) { rows = applyOr(rows, expr); return chain; },
    not() { return chain; },
    gte() { return chain; },
    lte() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle() {
      const hit = rows[0];
      return { then: (r) => r({ data: hit || null, error: hit ? null : { message: "no rows" } }) };
    },
    single() {
      const hit = rows[0];
      return { then: (r) => r({ data: hit || null, error: hit ? null : { message: "no rows" } }) };
    },
    insert(record) {
      pending.push({ type: "insert", record });
      return chain;
    },
    update(patch) {
      const ids = rows.map((r) => r.id);
      pending.push({ type: "update", ids, patch });
      rows = rows.map((r) => ({ ...r, ...patch }));
      return chain;
    },
    delete() {
      pending.push({ type: "delete", ids: rows.map((r) => r.id) });
      return chain;
    },
    then(resolve) {
      flush();
      const data = headOnly ? null : rows;
      const result = { data, error: null, count: rows.length };
      return Promise.resolve(result).then(resolve);
    },
  };
  return chain;
}

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: { supabase: { from } },
};
require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const controller = require("../src/controllers/attendanceController");
const { invalidateRoomCourseCache } = require("../src/utils/roomScope");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function mockRes() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    buffer: async () => Buffer.alloc(0),
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    end() {},
  };
}

async function call(handler, req) {
  const res = mockRes();
  await handler({ params: {}, query: {}, body: {}, ...req }, res);
  return res;
}

const SUPER = { user: { uid: "root" }, profile: { role: "admin", adminLevel: "super", courseId: null } };
const CT = { user: { uid: "ctAdmin" }, profile: { role: "admin", adminLevel: "course", courseId: "CT" } };
const BIT = { user: { uid: "bitAdmin" }, profile: { role: "admin", adminLevel: "course", courseId: "BIT" } };
const NONE = { user: { uid: "mtAdmin" }, profile: { role: "admin", adminLevel: "course", courseId: "MT" } };
const LEGACY = { user: { uid: "old" }, profile: { role: "admin", assignedCourses: ["CT"] } };

(async () => {
  console.log("--- room list is scoped by OWNING course ---");
  resetDb(); invalidateRoomCourseCache();
  check("super sees every room", (await call(controller.getRooms, SUPER)).payload.map((r) => r.id), ["room-cet", "room-net", "room-shop"]);
  check("CT admin sees only the CT room", (await call(controller.getRooms, CT)).payload.map((r) => r.id), ["room-cet"]);
  check("BIT admin sees only the BIT room", (await call(controller.getRooms, BIT)).payload.map((r) => r.id), ["room-net"]);
  check("an unassigned room is Super Admin only", (await call(controller.getRooms, SUPER)).payload.map((r) => r.id).includes("room-shop"), true);
  check("and invisible to Course Admins", (await call(controller.getRooms, CT)).payload.map((r) => r.id).includes("room-shop"), false);

  console.log("--- create is bounded to the caller's course ---");
  resetDb(); invalidateRoomCourseCache();
  check("own course is accepted", (await call(controller.createRoom, { ...CT, body: { roomName: "NEW CT ROOM", course: "CT" } })).statusCode, 200);
  check("another course is a 400", (await call(controller.createRoom, { ...CT, body: { roomName: "SNEAKY", course: "BIT" } })).statusCode, 400);
  check("and nothing was created", db.rooms.filter((r) => r.room_name === "SNEAKY").length, 0);
  check("super may create for any course", (await call(controller.createRoom, { ...SUPER, body: { roomName: "AT SHOP", course: "MT" } })).statusCode, 200);
  check("super may create an unassigned room", (await call(controller.createRoom, { ...SUPER, body: { roomName: "ORPHAN ROOM" } })).statusCode, 200);

  console.log("--- update cannot reach another course's room ---");
  resetDb(); invalidateRoomCourseCache();
  check("renaming a foreign room is a 404", (await call(controller.updateRoom, { ...CT, params: { id: "room-net" }, body: { roomName: "HACKED" } })).statusCode, 404);
  check("and the name is unchanged", db.rooms.find((r) => r.id === "room-net").room_name, "NET LAB");
  check("own room renames fine", (await call(controller.updateRoom, { ...CT, params: { id: "room-cet" }, body: { roomName: "CET CENTER 2" } })).statusCode, 200);

  console.log("--- moving a room between courses is Super Admin only, and reports the history ---");
  resetDb(); invalidateRoomCourseCache();
  check("a Course Admin cannot move their own room", (await call(controller.updateRoom, { ...CT, params: { id: "room-cet" }, body: { course: "BIT" } })).statusCode, 403);
  check("nor another course's room", (await call(controller.updateRoom, { ...BIT, params: { id: "room-cet" }, body: { course: "BIT" } })).statusCode, 404);
  check("super can move it", (await call(controller.updateRoom, { ...SUPER, params: { id: "room-cet" }, body: { course: "BIT" } })).statusCode, 200);
  check("and is told how much history moved", (await call(controller.updateRoom, { ...SUPER, params: { id: "room-cet" }, body: { course: "CT" } })).payload.historyTransferred, 2);
  check("an unknown target course is a 400", (await call(controller.updateRoom, { ...SUPER, params: { id: "room-cet" }, body: { course: "ZZZ" } })).statusCode, 400);
  check("a no-op course edit reports zero moved", (await call(controller.updateRoom, { ...SUPER, params: { id: "room-cet" }, body: { course: "CT" } })).payload.historyTransferred, 0);

  console.log("--- delete and QR printing are scoped ---");
  resetDb(); invalidateRoomCourseCache();
  check("deleting a foreign room is a 404", (await call(controller.deleteRoom, { ...CT, params: { id: "room-net" } })).statusCode, 404);
  check("and the room survives", db.rooms.filter((r) => r.id === "room-net").length, 1);
  check("printing a foreign room's QR is a 404", (await call(controller.getRoomQR, { ...CT, params: { id: "room-net" } })).statusCode, 404);
  check("printing your own room's QR works", (await call(controller.getRoomQR, { ...CT, params: { id: "room-cet" } })).statusCode, 200);

  console.log("--- the logbook is room-based, not student-course-based ---");
  resetDb(); invalidateRoomCourseCache();
  const ctActive = await call(controller.getActiveStudents, CT);
  const ids = ctActive.payload.map((r) => r.id).sort();
  check("CT admin sees only their room's open sessions", ids, ["a1", "a2"]);
  check("including a BIT student's session in that room", ids.includes("a1"), true);
  check("and not another room's", ids.includes("b1"), false);
  check("nor an entry whose room matches no lab_rooms row", ids.includes("orphan"), false);

  resetDb(); invalidateRoomCourseCache();
  const bitToday = await call(controller.getTodayAttendance, BIT);
  check("BIT admin's today-log is their room only", bitToday.payload.map((r) => r.id), ["b1"]);

  resetDb(); invalidateRoomCourseCache();
  const bitFacets = await call(controller.getAttendanceFacets, BIT);
  check("facet courses are scoped", bitFacets.payload.courses, ["BIT"]);
  check("facet professors are scoped", bitFacets.payload.professors, ["Reyes"]);
  check("facet rooms are scoped", bitFacets.payload.rooms, ["NET LAB"]);

  console.log("--- a room history page cannot be pointed at someone else's room ---");
  resetDb(); invalidateRoomCourseCache();
  check("own room history works", (await call(controller.getRoomAttendanceHistory, { ...CT, params: { roomId: "room-cet" } })).statusCode, 200);
  check("foreign room is a 404", (await call(controller.getRoomAttendanceHistory, { ...CT, params: { roomId: "room-net" } })).statusCode, 404);
  check("unknown room is a 404", (await call(controller.getRoomAttendanceHistory, { ...CT, params: { roomId: "nope" } })).statusCode, 404);

  console.log("--- logbook edits and deletes are scoped ---");
  resetDb(); invalidateRoomCourseCache();
  check("editing a foreign room's entry is a 404", (await call(controller.updateRecord, { ...CT, params: { id: "b1" }, body: { professor: "Hacked" } })).statusCode, 404);
  check("deleting it is a 404", (await call(controller.deleteRecord, { ...CT, params: { id: "b1" } })).statusCode, 404);
  check("and it survives", db.attendance.filter((r) => r.id === "b1").length, 1);
  check("editing your own room's entry works", (await call(controller.updateRecord, { ...CT, params: { id: "a2" }, body: { professor: "Dela Cruz" } })).statusCode, 200);
  check("moving an entry into another room is a 400", (await call(controller.updateRecord, { ...CT, params: { id: "a2" }, body: { roomCode: "net-lab" } })).statusCode, 400);

  console.log("--- an admin who owns no rooms sees nothing, and is not an error ---");
  resetDb(); invalidateRoomCourseCache();
  const orphan = await call(controller.getTodayAttendance, NONE);
  check("today-log is empty", orphan.payload, []);
  check("and it is a 200", orphan.statusCode, 200);
  const orphanActive = await call(controller.getActiveStudents, NONE);
  check("currently-inside is empty", orphanActive.payload, []);
  check("orphan admin room list is empty", (await call(controller.getRooms, NONE)).payload, []);
  check("orphan admin room history is a 404", (await call(controller.getRoomAttendanceHistory, { ...NONE, params: { roomId: "room-cet" } })).statusCode, 404);

  console.log("--- a legacy admin keeps the rooms of the courses it held ---");
  resetDb(); invalidateRoomCourseCache();
  check("legacy CT handler still sees the CT room", (await call(controller.getRooms, LEGACY)).payload.map((r) => r.id), ["room-cet"]);
  check("and its logbook", (await call(controller.getTodayAttendance, LEGACY)).payload.map((r) => r.id).sort(), ["a1", "a2"]);

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("roomScope: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});