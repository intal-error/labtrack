const { supabase } = require("../config/supabase");
const { scopeCodes } = require("../middleware/courseScope");

/**
 * Room-ownership scoping for the laboratory logbook.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT JUST `.in("course", [...])`: attendance is
 * room-based, not course-enforced. A student may log any room regardless of
 * their course, because the logbook answers "who used which room, when, for
 * what subject, under which professor" -- a facility question, not a course one.
 * lab_attendance.course therefore records the STUDENT's course as logbook detail
 * and is not an access boundary.
 *
 * So the boundary is room OWNERSHIP: lab_rooms.course says who administers a
 * room and who may read its history. A Course Admin sees the logbook of the
 * rooms their course owns, including entries by students of every other course.
 *
 * WHY THIS NEEDS ITS OWN MODULE: lab_attendance.room_code joins
 * lab_rooms.room_code as FREE TEXT, not a foreign key. PostgREST cannot embed
 * across a non-FK relationship, so there is no single-query form. The room codes
 * are resolved first and cached, then applied as `.in("room_code", [...])`.
 *
 * The alternative -- denormalising a room_course column onto every attendance
 * row -- was rejected because a room reassignment would then have to rewrite
 * history, and this codebase already has a scar from exactly that kind of
 * assumption (room_code being regenerated on rename).
 *
 * WHY NOT FILTERED BY ROOM STATUS: a deactivated room must keep showing its
 * logbook, or closing a room erases the record of who used it before closure
 * from every view except the raw table.
 */

// The same idea as IMPOSSIBLE_COURSE in middleware/courseScope.js: an empty
// `.in()` is a malformed filter that PostgREST answers with a 500 for the whole
// endpoint, so an admin who owns no rooms gets an equality filter on a value
// that cannot exist instead.
const IMPOSSIBLE_ROOM = "__no_room_in_scope__";

const ROOM_CACHE_TTL_MS = 60 * 1000;
let roomCodesCache = { at: 0, byCourse: new Map() };

/**
 * The room_codes a course owns. Returns [] for a course with no rooms, which
 * callers must short-circuit on rather than passing to .in() -- see
 * IMPOSSIBLE_COURSE in middleware/courseScope.js.
 */
async function getCourseRoomCodes(courseId) {
  if (!courseId) return [];

  const cached = roomCodesCache.byCourse.get(courseId);
  if (cached !== undefined && Date.now() - roomCodesCache.at < ROOM_CACHE_TTL_MS) {
    return cached;
  }

  const { data, error } = await supabase
    .from("lab_rooms")
    .select("room_code")
    .eq("course", courseId);

  if (error) throw new Error(error.message);

  const codes = [...new Set((data || []).map((r) => r.room_code).filter(Boolean))];

  // Stamped as a whole-batch write rather than per-entry, so eviction is O(1)
  // instead of a scan -- same reasoning as profileUrlCache in
  // transactionController.js:116.
  roomCodesCache = { at: Date.now(), byCourse: new Map([[courseId, codes]]) };
  return codes;
}

/**
 * Called after any room create / update / delete.
 *
 * MUST also fire on a change to a room's `course`: reassigning a room does not
 * rewrite lab_attendance.room_code, so the whole historical logbook silently
 * transfers to the new owning course. Cached lists are therefore wrong on both
 * the old course AND the new one, which is why this clears the whole batch
 * instead of deleting a single key.
 */
function invalidateRoomCourseCache() {
  roomCodesCache = { at: 0, byCourse: new Map() };
}

/**
 * The room_code values this request may read, or null for "no restriction".
 *
 * Separated from the query application because utils/fetchAll calls `.range()`
 * directly on whatever its thunk returns -- so a thunk must be SYNCHRONOUS, and
 * resolving room codes necessarily is not. Passing an async builder there fails
 * with "build(...).range is not a function", which is a confusing way to learn
 * that.
 *
 * null -> super admin, legacy unrestricted admin, or a student
 * []   -> the caller owns no rooms, which yields nothing
 */
async function resolveRoomCodeScope(req) {
  const codes = scopeCodes(req);
  if (codes === null) return null;
  if (codes.length === 0) return [];

  const roomCodes = new Set();
  for (const courseId of codes) {
    for (const roomCode of await getCourseRoomCodes(courseId)) roomCodes.add(roomCode);
  }
  return [...roomCodes];
}

/** Synchronous half of scopeByRoom. `roomCodes` comes from resolveRoomCodeScope. */
function applyRoomScope(query, roomCodes) {
  if (roomCodes === null) return query;
  if (roomCodes.length === 0) return query.eq("room_code", IMPOSSIBLE_ROOM);
  return query.in("room_code", roomCodes);
}

/**
 * Applies room-ownership scope to a lab_attendance builder.
 *
 * Iterates every course the caller holds rather than just `courseId`, because a
 * legacy admin can carry an assignedCourses array and still needs to see the
 * rooms of all of them -- otherwise their logbook silently empties on the day
 * course scoping lands.
 *
 * A Super Admin and a student both pass through untouched: the logbook's top
 * level is the whole building, and students read their OWN attendance via
 * /attendance/my/:schoolId, which filters on user_id instead.
 */
async function scopeByRoom(query, req) {
  return applyRoomScope(query, await resolveRoomCodeScope(req));
}

/** True when this row's room belongs to one of the caller's courses. */
async function roomInScope(req, roomCode) {
  const codes = scopeCodes(req);
  if (codes === null) return true;
  if (!roomCode) return false;
  for (const courseId of codes) {
    const owned = await getCourseRoomCodes(courseId);
    if (owned.includes(roomCode)) return true;
  }
  return false;
}

module.exports = {
  IMPOSSIBLE_ROOM,
  getCourseRoomCodes,
  invalidateRoomCourseCache,
  resolveRoomCodeScope,
  applyRoomScope,
  scopeByRoom,
  roomInScope,
};