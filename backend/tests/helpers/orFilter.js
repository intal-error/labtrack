// Shared Supabase query-builder test helper.
//
// WHY THIS EXISTS: the performance work pushed predicates into PostgREST `.or()`,
// built with QUOTED values (utils/postgrest.js orEq) so a room code or course name
// containing a comma cannot produce a malformed filter. Every stub that implements
// `.or()` therefore has to parse the quoted form correctly.
//
// The failure mode is silent and nasty: a stub that splits on every comma treats a
// comma INSIDE a quoted value as a clause separator, ends up with one clause per
// variant instead of one per variant, and the endpoint matches nothing. The suite
// then reports "0 rows" for a fixture that plainly contains matching rows -- which
// reads as a product bug rather than a stub bug.
//
// So this parser lives in one place and every stub uses it. It is deliberately
// STRICT (it throws on malformed input, like PostgREST does) so a stub cannot pass by
// ignoring a filter it should have applied.

/** Splits an `or=` filter on top-level commas only. A comma inside quotes is data. */
function splitOrClauses(expr) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    // A backslash is only an escape inside a quoted value.
    if (ch === "\\" && inQuotes) {
      current += ch + (expr[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (inQuotes) throw new Error("unterminated quote in or() filter");
  out.push(current);
  return out;
}

/**
 * Parses one `<column>.<operator>.<value>` clause, unquoting a quoted value and
 * honouring backslash escapes within it.
 */
function parseOrClause(raw) {
  const clause = raw.trim();
  const firstDot = clause.indexOf(".");
  if (firstDot <= 0) throw new Error(`malformed or() clause: ${raw}`);

  const col = clause.slice(0, firstDot);
  const rest = clause.slice(firstDot + 1);
  const opDot = rest.indexOf(".");
  if (opDot <= 0) throw new Error(`malformed or() clause: ${raw}`);

  const filter = rest.slice(0, opDot);
  let value = rest.slice(opDot + 1);

  if (value.startsWith('"')) {
    value = value.slice(1);
    let out = "";
    let closed = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === "\\") {
        out += value[i + 1] ?? "";
        i += 1;
      } else if (ch === '"') {
        closed = true;
        break;
      } else {
        out += ch;
      }
    }
    if (!closed) throw new Error("unterminated quoted value in or() filter");
    value = out;
  }

  return { col, filter, value };
}

/** Full parse: array of { col, filter, value }, one per clause. */
function parseOr(expr) {
  return splitOrClauses(expr).map(parseOrClause);
}

/**
 * Applies an `or=` filter to an array of rows, the way Postgres would.
 *
 * OR-ed across clauses, AND-ed against whatever earlier .eq()/.gte() already
 * narrowed -- which is why callers keep filtering a running array rather than
 * re-querying the source.
 */
function applyOr(rows, expr) {
  const clauses = parseOr(expr);
  if (clauses.length === 0) return rows;
  return rows.filter((row) =>
    clauses.some(({ col, filter, value }) => {
      const actual = String(row[col]);
      switch (filter) {
        case "neq": return actual !== String(value);
        case "gt": return actual > String(value);
        case "gte": return actual >= String(value);
        case "lt": return actual < String(value);
        case "lte": return actual <= String(value);
        case "is": return value === "null" ? row[col] == null : actual === String(value);
        default: return actual === String(value); // eq
      }
    })
  );
}

module.exports = { splitOrClauses, parseOrClause, parseOr, applyOr };