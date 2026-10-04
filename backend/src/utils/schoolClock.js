/**
 * The one place that answers "what day is it?" for attendance.
 *
 * WHY THIS FILE EXISTS: every attendance date boundary used to be derived from
 * the host's OS clock. `new Date().getFullYear()` and friends return the SERVER's
 * calendar day, and the deploy target (Render) runs UTC with no TZ configured --
 * see render.yaml. For 8 hours of every Philippine day (00:00-08:00 PHT = 16:00-
 * 24:00 UTC the previous day) the server's "today" was YESTERDAY. A student who
 * scanned in at 07:30 was written under the previous date, so they vanished from
 * "Currently Inside", were missing from "Today's Log", and could not sign out
 * (timeOut/autoScan both required `date === today` to find the open session).
 *
 * It also decides what a stored `date` means. lab_attendance.date is a Postgres
 * DATE column holding a bare YYYY-MM-DD, written from this module's key, so every
 * read that compares against "today" has to use the same clock or it compares
 * against a different day than the one the row was written with.
 *
 * All arithmetic goes through Intl with an explicit timeZone rather than manual
 * offset maths (+8, no DST) so it stays correct if the school ever moves, and so
 * there is no second place to keep in sync.
 *
 * Overridable with SCHOOL_TIMEZONE; defaults to the school's timezone.
 */

const DEFAULT_TIMEZONE = "Asia/Manila";

function resolveTimezone() {
  const configured = String(process.env.SCHOOL_TIMEZONE || "").trim();
  if (!configured) return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError on an unknown zone, which we do not want to become an
    // unhandled crash at boot -- a typo in an env var would otherwise take the
    // whole API down instead of degrading to UTC.
    new Intl.DateTimeFormat("en-US", { timeZone: configured }).format(new Date());
    return configured;
  } catch (err) {
    console.error(
      `SCHOOL_TIMEZONE "${configured}" is not a valid IANA timezone (${err.message}); falling back to ${DEFAULT_TIMEZONE}.`
    );
    return DEFAULT_TIMEZONE;
  }
}

const TIMEZONE = resolveTimezone();

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** Calendar fields for an instant, as seen in the school's timezone. */
function partsAt(date) {
  const parts = {};
  for (const part of partsFormatter.formatToParts(date)) parts[part.type] = part.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const pad = (value, width = 2) => String(value).padStart(width, "0");

/** YYYY-MM-DD for an instant, in school time. */
function dayKey(date = new Date()) {
  const { y, m, d } = partsAt(date instanceof Date ? date : new Date(date));
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** The school-time calendar day, i.e. what a scan happening now is filed under. */
function todayKey(now = new Date()) {
  return dayKey(now);
}

/**
 * YYYY-MM-DD of the Sunday starting the current school-time week.
 *
 * The weekday is computed on a UTC date built from the school-local Y/M/D, then
 * read back with getUTC*. Doing it this way means the host offset cannot drag the
 * arithmetic across a day boundary -- the previous implementation took local
 * midnight and then sliced it with toISOString(), which in any timezone behind UTC
 * returned the day before whenever the host was on UTC.
 */
function weekStartKey(now = new Date()) {
  const { y, m, d } = partsAt(now instanceof Date ? now : new Date(now));
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  asUtc.setUTCDate(asUtc.getUTCDate() - asUtc.getUTCDay());
  return `${asUtc.getUTCFullYear()}-${pad(asUtc.getUTCMonth() + 1)}-${pad(asUtc.getUTCDate())}`;
}

/**
 * Wall-clock time for an ISO instant, in school time.
 *
 * Used by the XLSX export, whose cells are plain strings. The browser renders
 * time_in itself in the viewer's own timezone, so the table on screen was right
 * while the downloaded workbook showed server-local -- 8 hours off for anyone
 * outside the server's zone.
 */
function formatTimeInTz(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return timeFormatter.format(date);
}

module.exports = {
  TIMEZONE,
  dayKey,
  todayKey,
  weekStartKey,
  formatTimeInTz,
};