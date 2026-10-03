import { useMemo } from "react";

/**
 * Normalises one entry into a { value, label } pair.
 *
 * Two shapes reach this component:
 *   · plain strings — every facet list, because the backend's `facet()` helper
 *     (backend/src/utils/attendanceFilters.js) returns raw column values and
 *     `lab_attendance.course/year/section/subject` are all TEXT.
 *   · { value, label } objects — the room list on the logs page, which is built
 *     from `roomCode` (the value the API filters on) and `roomName` (what the
 *     admin reads).
 *
 * Anything that is not an object is stringified rather than tested for
 * `typeof === "string"`, so a numeric or boolean facet still renders instead of
 * silently blanking. An object missing `label` falls back to its `value`.
 */
const toOption = (o) =>
  o != null && typeof o === "object" ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) };

// Stable identity for the "not an array" case, so the memo below is not handed a
// fresh [] on every render.
const EMPTY = [];

/**
 * Filter dropdown for the admin attendance screens (Today's Log on /attendance
 * and the room history on /attendance/room/:roomId).
 *
 * `options` MAY be a heterogeneous array of strings and objects — both shapes
 * are accepted and normalised here.
 *
 * The control is ALWAYS rendered. An empty `options` list means this facet has
 * no values at all for the current scope, which on the room page is a room with
 * no attendance history. Rather than hiding the dropdown — which made the
 * toolbar change shape from room to room — it renders disabled and reads
 * `emptyLabel`. Showing `allLabel` there would be a lie, since "All Sections"
 * implies a filter is in play, and leaving it enabled would offer a filter that
 * cannot match anything.
 *
 * @param {string}   label       accessible name; also the tooltip
 * @param {string}   value       currently selected value
 * @param {Function} onChange    called with the next value (a string)
 * @param {Array}    options     strings and/or { value, label } objects
 * @param {string}   allLabel    label for the "no filter" row
 * @param {string}   emptyLabel  label shown instead when there are no options
 * @param {string}   className   class for the <select>
 */
export default function AttendanceFilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  emptyLabel = "None yet",
  className = "au-select",
}) {
  const list = Array.isArray(options) ? options : EMPTY;
  const isEmpty = list.length === 0;

  // Coerced to string on every entry: a DOM option value is always a string, so
  // onChange can never hand back undefined regardless of what the API returned.
  // `list` is the EMPTY constant when options is not an array, so the memo
  // depends on the caller's array identity rather than a fresh [] each render.
  const normalized = useMemo(
    () => [{ value: "", label: isEmpty ? emptyLabel : allLabel }, ...list.map(toOption)],
    [list, allLabel, emptyLabel, isEmpty]
  );

  return (
    <select
      className={`${className}${isEmpty ? " au-select--empty" : ""}`}
      aria-label={label}
      title={label}
      // Empty facets are pinned to the sentinel: the control is disabled, and
      // forcing "" keeps a stale filter value from surviving a room change.
      value={isEmpty ? "" : value}
      disabled={isEmpty}
      onChange={(e) => onChange(e.target.value)}
    >
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
