const { parseLocalDay } = require("./exportUtils");

/** Local calendar day as YYYY-MM-DD, matching the `date` column's format. */
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Case-insensitive comparison so "BIT" matches "bit".
 *
 * Used only for EXPLICIT query filters the user picked in the UI. It is not a
 * permission check, and must not become one: attendance scoping is applied in SQL
 * by scopeByRoom() (utils/roomScope.js) against room ownership, while the filters
 * below run in JS against rows that have ALREADY been scoped.
 *
 * That separation is the reason the course filter here stays case-insensitive.
 * Scoping is a strict equality match on `courses.id`, which is why a
 * case-mismatched value narrows to nothing -- but the user's own dropdown filter
 * should never be the thing that hides their data, which is exactly the bug the
 * old per-admin scoping produced (an assignment stored as "bit" against rows
 * stored as "BIT" returned nothing while one screen worked and another did not).
 */
const eqInsensitive = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Single definition of room normalization, shared by the room table and the
 * export. Both must agree byte-for-byte or a room's own report would not match
 * the rows listed on screen. Collapses punctuation runs to a single dash:
 * "CET-01", "cet 01" and "CET_01" all normalize to "cet-01".
 */
const normRoom = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Matches a single field against a single filter value.
 *
 * Exact wins first, then normalized equality. Raw substring matching is
 * deliberately avoided: "CET-01" must not swallow "CET-010", and "LAB 1" must
 * not swallow "LAB 10".
 */
function matchesField(recordValue, filter) {
  if (!recordValue || !filter) return false;
  if (eqInsensitive(recordValue, filter)) return true;
  const a = normRoom(recordValue);
  const b = normRoom(filter);
  return a.length > 0 && a === b;
}

/**
 * Room scoping is field-explicit on purpose.
 *
 * The room table filters on `room_code` alone, so the export must do the same:
 * trying every filter against every field let a row whose lab_room merely
 * resembled the room into its report, which the table never showed. A code
 * filter only ever consults room_code; a name filter only ever lab_room.
 */
const toList = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);

const matchesRoomCode = (record, codeFilters) => {
  const filters = toList(codeFilters);
  if (filters.length === 0) return false;
  return filters.some((f) => matchesField(record.room_code, f));
};

const matchesLabRoom = (record, nameFilters) => {
  const filters = toList(nameFilters);
  if (filters.length === 0) return false;
  return filters.some((f) => matchesField(record.lab_room, f));
};


/**
 * Applies the query filters shared by the attendance tables and their exports.
 * Keeping this in one place guarantees the XLSX matches what is on screen.
 */
function applyAttendanceFilters(records, query = {}) {
  let result = records || [];

  if (query.date) {
    result = result.filter((r) => r.date === query.date);
  } else {
    if (query.from) {
      const from = parseLocalDay(query.from);
      if (from) {
        // Compare on the calendar day, not the raw string: an ISO timestamp
        // from/to would otherwise drop the boundary day itself.
        const fromDay = dayKey(from);
        result = result.filter((r) => (r.date || "") >= fromDay);
      }
    }
    if (query.to) {
      const to = parseLocalDay(query.to, true);
      if (to) result = result.filter((r) => (r.date || "") <= dayKey(to));
    }
  }

  if (query.course) result = result.filter((r) => eqInsensitive(r.course, query.course));
  if (query.year) result = result.filter((r) => eqInsensitive(r.year, query.year));
  if (query.section) result = result.filter((r) => eqInsensitive(r.section, query.section));
  if (query.subject) result = result.filter((r) => eqInsensitive(r.subject, query.subject));
  if (query.professor) result = result.filter((r) => eqInsensitive(r.professor, query.professor));
  // Guard on content, not truthiness: an empty array is truthy, and passing one
  // through would filter out every row.
  const codeList = toList(query.roomCode);
  const nameList = toList(query.labRoom);
  if (codeList.length > 0) result = result.filter((r) => matchesRoomCode(r, codeList));
  if (nameList.length > 0) result = result.filter((r) => matchesLabRoom(r, nameList));

  if (query.student) {
    const s = String(query.student).trim().toLowerCase();
    result = result.filter((r) =>
      (r.first_name || "").toLowerCase().includes(s) ||
      (r.last_name || "").toLowerCase().includes(s) ||
      (r.student_school_id || "").toLowerCase().includes(s)
    );
  }

  return result;
}

/** Newest date first, then latest time-in. */
function sortAttendance(records) {
  return [...(records || [])].sort((a, b) => {
    const dA = a.date || "";
    const dB = b.date || "";
    if (dA !== dB) return dB.localeCompare(dA);
    return new Date(b.time_in || 0).getTime() - new Date(a.time_in || 0).getTime();
  });
}

/** Oldest date first, then earliest time-in -- used for exports. */
function sortAttendanceAsc(records) {
  return [...(records || [])].sort((a, b) => {
    const dA = a.date || "";
    const dB = b.date || "";
    if (dA !== dB) return dA.localeCompare(dB);
    return new Date(a.time_in || 0).getTime() - new Date(b.time_in || 0).getTime();
  });
}

/** Distinct non-empty values, for building the filter dropdowns. */
function facet(records, key) {
  return [...new Set((records || []).map((r) => r[key]).filter(Boolean))].sort();
}

const formatDay = (value) => {
  if (!value) return "";
  const parsed = parseLocalDay(value);
  if (!parsed) return String(value);
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

/** Human-readable description of the filters applied, shown under the sheet title. */
function describeAttendanceFilters(query) {
  const parts = [];
  if (query.course) parts.push(`Course: ${query.course}`);
  if (query.year) parts.push(`Year: ${query.year}`);
  if (query.section) parts.push(`Section: ${query.section}`);
  if (query.subject) parts.push(`Subject: ${query.subject}`);
  if (query.professor) parts.push(`Professor: ${query.professor}`);
  if (query.roomCode) parts.push(`Room: ${query.roomCode}`);
  else if (query.labRoom) parts.push(`Room: ${query.labRoom}`);

  if (query.date) {
    parts.push(`Date: ${query.date}`);
  } else if (query.from || query.to) {
    parts.push(`From: ${formatDay(query.from) || "N/A"} To: ${formatDay(query.to) || "N/A"}`);
  } else {
    parts.push("All Time");
  }

  if (query.student) parts.push(`Search: "${query.student}"`);
  return parts.join(" | ");
}

module.exports = {
  applyAttendanceFilters,
  sortAttendance,
  sortAttendanceAsc,
  facet,
  describeAttendanceFilters,
  matchesField,
  matchesRoomCode,
  matchesLabRoom,
  normRoom,
  dayKey,
};
