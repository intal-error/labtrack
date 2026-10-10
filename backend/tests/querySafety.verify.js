// Pins two contracts the performance work could silently break:
//
//   1. PostgREST `.or()` escaping. The work pushed `course` and `room_code` filters
//      down into `.or()` built by string interpolation. `.or()` takes an UNESCAPED
//      mini-language where `,` separates clauses, `.` delimits the operator, `(``)`
//      group and `"` quotes -- so any value containing one of those produced a
//      malformed filter. PostgREST answers that with a syntax error, which the
//      controllers turn into a 500 for the WHOLE endpoint.
//
//      Neither value is constrained: validate.js accepts
//      `course: z.string().min(1).max(50).trim()` with no character restrictions, so
//      "BSIT, CS" and "CS (Elective)" are both legal registrations.
//
//   2. NULL ordering for the pushed-down date sort. `sortTransactions` coerces a
//      missing timestamp to 0, putting such rows LAST in date-desc; Postgres defaults
//      to NULLS FIRST for DESC, so the pushdown inverted them and changed what
//      `?page=1` showed.
//
// Run: node tests/querySafety.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");
const { orEq, orEqAny, needsOrQuoting } = require("../src/utils/postgrest");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want  ${e}`}`);
}

// ── Parsing oracle ──────────────────────────────────────────────────────────
// A strict parser for the `or=` mini-language, written independently of the escaping
// code so a shared mistake is impossible. Throws on anything malformed, which is
// what PostgREST does.

/** Splits on top-level commas only: a comma inside quotes is data, not a separator. */
function splitClauses(expr) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
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
  if (inQuotes) throw new Error("unterminated quote across clauses");
  out.push(current);
  return out;
}

function parseOrClause(clause) {
  const trimmed = clause.trim();
  if (!trimmed) throw new Error("empty clause");

  const firstDot = trimmed.indexOf(".");
  if (firstDot <= 0) throw new Error(`missing operator: ${clause}`);
  const secondDot = trimmed.indexOf(".", firstDot + 1);

  if (secondDot === -1) {
    const column = trimmed.slice(0, firstDot);
    const rest = trimmed.slice(firstDot + 1);
    const opDot = rest.indexOf(".");
    if (opDot <= 0) throw new Error(`missing value: ${clause}`);
    return { column, operator: rest.slice(0, opDot), value: rest.slice(opDot + 1) };
  }

  const column = trimmed.slice(0, firstDot);
  const operator = trimmed.slice(firstDot + 1, secondDot);

  // A value containing a reserved character is only legal quoted.
  let rest = trimmed.slice(secondDot + 1);
  if (!rest.startsWith('"')) throw new Error(`unquoted reserved character: ${clause}`);
  rest = rest.slice(1);

  let value = "";
  let closed = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "\\") {
      const next = rest[i + 1];
      if (next === undefined) throw new Error("trailing backslash");
      value += next;
      i += 1;
    } else if (ch === '"') {
      closed = true;
      const trailing = rest.slice(i + 1);
      if (trailing !== "") throw new Error(`trailing junk after quote: ${trailing}`);
      break;
    } else {
      value += ch;
    }
  }
  if (!closed) throw new Error("unterminated quoted value");

  return { column, operator, value };
}

function parseOr(expr) {
  return splitClauses(expr).map(parseOrClause);
}

// Values that break naive interpolation. All are legal per validate.js.
const HOSTILE = [
  "BSIT, CS",
  "CS (Elective)",
  'He said "IT"',
  "back\\slash",
  "a.b",
  "BIT, CS, MT",
  "100%, (L)",
  '"',
  "\\",
];

console.log("--- plain values parse and round-trip ---");
for (const v of ["BIT", "CT", "NET LAB", "1st Year"]) {
  let parsed = null;
  let error = null;
  try { parsed = parseOr(orEq("course", v)); } catch (e) { error = e.message; }
  check(`"${v}" parses`, error, null);
  if (parsed) {
    check(`  column`, parsed[0].column, "course");
    check(`  operator`, parsed[0].operator, "eq");
    check(`  value verbatim`, parsed[0].value, v);
  }
}

console.log("--- hostile values are quoted: one clause, value round-trips exactly ---");
for (const v of HOSTILE) {
  let parsed = null;
  let error = null;
  try { parsed = parseOr(orEq("course", v)); } catch (e) { error = e.message; }
  check(`"${v}" parses`, error, null);
  if (parsed) {
    check("  a comma did NOT split the clause", parsed.length, 1);
    check("  value byte-for-byte", parsed[0].value, v);
  }
}

console.log("--- multi-column (course + equipment_course) survives too ---");
for (const v of HOSTILE) {
  let parsed = null;
  let error = null;
  try { parsed = parseOr(orEqAny(["course", "equipment_course"], v)); } catch (e) { error = e.message; }
  check(`"${v}" two-column form parses`, error, null);
  if (parsed) {
    check("  two clauses", parsed.length, 2);
    check("  columns in order", parsed.map((p) => p.column), ["course", "equipment_course"]);
    check("  both values round-trip", parsed.map((p) => p.value), [v, v]);
  }
}

console.log("--- the OLD unescaped form really did break (so this test has teeth) ---");
for (const v of HOSTILE) {
  const naive = `course.eq.${v},equipment_course.eq.${v}`;
  let broke = false;
  try {
    const parsed = parseOr(naive);
    broke = parsed.length !== 2 || parsed[0].value !== v || parsed[1].value !== v;
  } catch {
    broke = true;
  }
  check(`naive interpolation breaks on "${v}"`, broke, true);
}

console.log("--- needsOrQuoting matches what actually breaks ---");
check("BIT needs no quoting", needsOrQuoting("BIT"), false);
check("comma", needsOrQuoting("a,b"), true);
check("paren", needsOrQuoting("a(b)"), true);
check("dot", needsOrQuoting("a.b"), true);
check("quote", needsOrQuoting('a"b'), true);
check("backslash", needsOrQuoting("a\\b"), true);

// ── End-to-end through queryTransactions ─────────────────────────────────────
// The stub PARSES the filter rather than ignoring it, so a regression to
// interpolation throws here instead of 500-ing in production. It is installed
// BEFORE the require because the module captures the client at require time.

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: { firestore: () => ({ FieldPath: { documentId: () => "__name__" } }) },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    auth: {},
  },
};

const TX = [
  { id: "t1", action: "borrowed", course: "BIT", year: "1st Year", status: "borrowed", quantity: 1, returned_quantity: 0, timestamp: "2026-03-01T00:00:00Z" },
  { id: "t2", action: "borrowed", course: "BSIT, CS", year: "1st Year", status: "borrowed", quantity: 2, returned_quantity: 0, timestamp: "2026-02-01T00:00:00Z" },
  { id: "t3", action: "borrowed", course: "CS (Elective)", year: "1st Year", status: "borrowed", quantity: 3, returned_quantity: 0, timestamp: "2026-01-01T00:00:00Z" },
  // Deliberately NO timestamp, to pin NULL ordering.
  { id: "noTs", action: "borrowed", course: "BIT", year: "1st Year", status: "borrowed", quantity: 1, returned_quantity: 0, timestamp: null },
];

let lastOrExpr = null;
const nullsFirstRequested = [];

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    supabase: {
      from: () => {
        let rows = [...TX];
        const chain = {
          select: () => chain,
          eq: (k, v) => { rows = rows.filter((r) => String(r[k]) === String(v)); return chain; },
          or: (expr) => {
            lastOrExpr = expr;
            const clauses = parseOr(expr); // throws on malformed, like PostgREST
            rows = rows.filter((r) => clauses.some((c) => String(r[c.column]) === String(c.value)));
            return chain;
          },
          gte: (k, v) => { rows = rows.filter((r) => new Date(r[k]) >= new Date(v)); return chain; },
          lte: (k, v) => { rows = rows.filter((r) => new Date(r[k]) <= new Date(v)); return chain; },
          in: () => chain,
          order: (k, opts = {}) => {
            nullsFirstRequested.push(opts.nullsFirst);
            const dir = opts.ascending === false ? -1 : 1;
            const present = rows.filter((r) => r[k] != null)
              .sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * dir);
            const missing = rows.filter((r) => r[k] == null);
            rows = opts.nullsFirst ? [...missing, ...present] : [...present, ...missing];
            return chain;
          },
          then: (res) => res({ data: rows, error: null, count: rows.length }),
        };
        return chain;
      },
    },
  },
};

const tf = require("../src/utils/transactionFilters");

// queryTransactions now REQUIRES the request: the course scope it applies is the
// only thing keeping an admin inside their own course, so an optional parameter
// would fail open for any caller who forgot. These cases are all about filter
// quoting and NULL ordering, so they run as the top tier to leave that behaviour
// unchanged.
const SUPER_REQ = { profile: { role: "admin", adminLevel: "super", courseId: null } };

(async () => {
  console.log("--- queryTransactions returns rows, it does not throw, for hostile courses ---");
  const comma = await tf.queryTransactions("borrowed", { course: "BSIT, CS" }, SUPER_REQ);
  check("comma course: one row", comma.length, 1);
  check("comma course: the right row", comma[0].id, "t2");
  check("filter was quoted", lastOrExpr.includes('"'), true);

  const paren = await tf.queryTransactions("borrowed", { course: "CS (Elective)" }, SUPER_REQ);
  check("paren course: one row", paren.length, 1);
  check("paren course: the right row", paren[0].id, "t3");

  console.log("--- NULL timestamps sort LAST in date-desc, as the old JS comparator did ---");
  nullsFirstRequested.length = 0;
  const desc = await tf.queryTransactions("borrowed", { sort: "date-desc", course: "BIT" }, SUPER_REQ);
  check("date-desc requests nullsFirst:false", nullsFirstRequested[0], false);
  check("date-desc order", desc.map((r) => r.id), ["t1", "noTs"]);

  const asc = await tf.queryTransactions("borrowed", { sort: "date-asc", course: "BIT" }, SUPER_REQ);
  check("date-asc requests nullsFirst:true", nullsFirstRequested[1], true);
  check("date-asc order", asc.map((r) => r.id), ["noTs", "t1"]);

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();