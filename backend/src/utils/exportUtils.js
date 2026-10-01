/**
 * A bare YYYY-MM-DD from a date picker is a local calendar day, but
 * `new Date("2026-07-01")` parses it as UTC midnight -- which in UTC+8 lands at
 * 08:00 local and silently drops events earlier that day. Anchor date-only
 * values to local midnight instead. Full ISO timestamps pass through untouched.
 */
function parseLocalDay(value, endOfDay = false) {
  if (!value) return null;
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!dayOnly) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [, y, m, d] = dayOnly;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  if (endOfDay) parsed.setHours(23, 59, 59, 999);
  return parsed;
}

/** Filesystem-safe fragment for download filenames. */
function slug(value) {
  return String(value || "").trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

module.exports = { parseLocalDay, slug };
