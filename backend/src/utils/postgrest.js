/**
 * PostgREST query-string escaping.
 *
 * Supabase's `.or()` (and `.not()`) take an UNESCAPED mini-language:
 *
 *   .or('course.eq.BSIT,equipment_course.eq.BSIT')
 *
 * where `,` separates clauses, the first `.` delimits the operator from the column,
 * `(`/`)` group, and `"` quotes a value. Interpolating user-supplied text straight
 * into that string produces a malformed filter for any value containing those
 * characters -- PostgREST answers with a syntax error, which the controllers turn
 * into a 500 for the WHOLE endpoint, not a 400 for the bad parameter.
 *
 * This is not hypothetical for either caller:
 *
 *   - `course` is free text. validate.js accepts `z.string().min(1).max(50).trim()`
 *     with no character restrictions, so "BSIT, CS" and "CS (Elective)" are both
 *     legal registrations, and both break an unescaped `.or()`.
 *   - `room_code` is admin-controlled and FROZEN on rename. createRoom slugifies new
 *     rooms into [a-z0-9-], but the column was never backfilled and can be edited by
 *     hand, so legacy codes with commas or brackets exist.
 *
 * Quoting is PostgREST's documented escape. Inside a double-quoted value only `\` and
 * `"` are meaningful, so those two are escaped first -- order matters, which is why
 * this is a single pass with the backslash replacement first rather than two
 * independent `.replace()` calls.
 *
 * Deliberately NOT sanitised by stripping the characters instead. That would silently
 * change what the caller asked for ("BSIT, CS" would become "BSIT CS" and match
 * nothing) -- a wrong answer instead of a loud one.
 */
function orEq(column, value) {
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${column}.eq."${escaped}"`;
}

/**
 * Builds a `col.eq.v` OR-clause list from [column, value] pairs, skipping empty values.
 *
 * `values` is an array so a caller can match a value against several columns (course
 * spans both `course` and `equipment_course` on transactions).
 */
function orEqAny(columns, value) {
  return columns.map((column) => orEq(column, value)).join(",");
}

/** True when a value would break an unescaped clause, i.e. needs quoting. */
function needsOrQuoting(value) {
  return /[,."()\\]/.test(String(value ?? ""));
}

module.exports = { orEq, orEqAny, needsOrQuoting };