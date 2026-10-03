export function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "-";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(timestamp) {
  if (!timestamp) return "-";
  let date;
  if (typeof timestamp?.toDate === "function") date = timestamp.toDate();
  else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
  else if (timestamp instanceof Date) date = timestamp;
  else date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Drops any filter whose value is no longer present in its facet list.
 *
 * A <select> whose `value` matches no rendered <option> does not warn: the
 * browser silently shows the first option ("All Sections") while the filter
 * state and the outgoing query still carry the stale value. The toolbar then
 * claims no filter is applied while the table is filtered by one, and the only
 * clue is a stray "Clear Filters" button.
 *
 * Reachable in normal use: filter Section = 4B, then delete the last 4B row in
 * that room. The deletion invalidates the query, the facet list is recomputed
 * from the room's remaining rows, and "4B" disappears from the dropdown.
 *
 * Returns the SAME object when nothing needs pruning, so callers can use the
 * result as a useMemo/useEffect dependency without re-running on every render.
 * Pure and side-effect free — the stale value stays in state but stops reaching
 * the query, which avoids a setState-in-effect cascade.
 *
 * @param {object} filters          current filter state, e.g. { course: "BIT" }
 * @param {object} facets           facet lists keyed by the SAME filter names
 * @returns {object} filters with any now-unmatchable values cleared
 */
export function pruneFilters(filters, facets) {
  let next = filters;
  for (const [key, values] of Object.entries(facets || {})) {
    const current = next[key];
    if (!current) continue;
    // Normalised the same way AttendanceFilterSelect normalises its options, so
    // a facet of {value,label} objects is compared on `value`, not the object.
    const options = (Array.isArray(values) ? values : []).map((v) => (v != null && typeof v === "object" ? String(v.value) : String(v)));
    if (!options.includes(String(current))) {
      if (next === filters) next = { ...filters };
      next[key] = "";
    }
  }
  return next;
}
