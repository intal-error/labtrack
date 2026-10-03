// Explicit ".js" so this module can be imported by Node's ESM resolver, which is
// what lets tests/exportReport.verify.js exercise buildAttendanceQuery directly.
// The rest of src/ uses extensionless relative imports because only Vite ever
// loads them; Node requires the extension for relative ESM specifiers.
import { localDayKey } from "./dateRange.js";

export const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

/**
 * Resolves a date range selection into query params. Shared by the table filter
 * and the export dialog so both always describe the same window.
 */
export function rangeToParams(range, from, to) {
  if (!range || range === "all") return {};

  if (range === "custom") {
    const params = {};
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    return params;
  }

  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { dateFrom: start.toISOString() };
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { dateFrom: start.toISOString() };
  }
  if (range === "month") {
    // setMonth(-1) overflows (Oct 31 -> Oct 1); go through the clamped helper.
    return { dateFrom: monthsBack(now, 1).toISOString() };
  }
  return {};
}

/** Builds the query string sent to /reports/:type. */
export function buildExportQuery({ tab, course, year, dateRange, dateFrom, dateTo, search, sort }) {
  const params = { tab, ...rangeToParams(dateRange, dateFrom, dateTo) };
  if (course && course !== "All") params.course = course;
  if (year && year !== "All") params.year = year;
  if (search) params.search = search;
  if (sort) params.sort = sort;
  return params;
}

/** Number of days in a given month (0-indexed). */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/**
 * Same day-of-month, N months earlier, clamped to that month's length.
 * Without the clamp, `new Date(2026, 1, 31)` overflows to Mar 3 and
 * "This Month" silently returns the wrong window.
 */
function monthsBack(date, months) {
  const targetMonth = date.getMonth() - months;
  const day = Math.min(date.getDate(), daysInMonth(date.getFullYear(), targetMonth));
  return new Date(date.getFullYear(), targetMonth, day);
}

/**
 * Calendar-day bounds for a preset, in the browser's timezone.
 *
 * rangeToParams() deliberately returns UTC instants because the transactions
 * table compares real timestamps. Attendance filters a TEXT `date` column
 * (YYYY-MM-DD), so slicing those instants with .slice(0, 10) is wrong: in UTC+8
 * "This Week" would resolve to the previous day in the morning and the correct
 * day in the afternoon. Derive the days locally instead.
 */
function calendarBounds(range, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (range === "today") return { from: localDayKey(end), to: localDayKey(end) };

  if (range === "week") {
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    return { from: localDayKey(start), to: localDayKey(end) };
  }

  if (range === "month") {
    return { from: localDayKey(monthsBack(end, 1)), to: localDayKey(end) };
  }

  return {};
}

/** Builds the query string sent to /attendance/export. */
export function buildAttendanceQuery({ course, year, section, subject, professor, roomCode, roomId, dateRange, dateFrom, dateTo, search }) {
  const params = {};

  if (dateRange === "today") {
    params.date = localDayKey(new Date());
  } else if (dateRange === "custom") {
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
  } else {
    const bounds = calendarBounds(dateRange);
    if (bounds.from) params.from = bounds.from;
    if (bounds.to) params.to = bounds.to;
  }

  // Every field is guarded against the "All" sentinel, which is what the dialog
  // seeds an untouched select to. Miss one and the backend receives it as a real
  // filter value: applyAttendanceFilters does eqInsensitive(r.subject, "All"),
  // false for every genuine row, so the export silently returns zero records
  // while reporting success.
  if (course && course !== "All") params.course = course;
  if (year && year !== "All") params.year = year;
  if (section && section !== "All") params.section = section;
  if (subject && subject !== "All") params.subject = subject;
  if (professor && professor !== "All") params.professor = professor;
  if (roomCode) params.roomCode = roomCode;
  if (roomId) params.roomId = roomId;
  if (search) params.student = search;
  return params;
}
