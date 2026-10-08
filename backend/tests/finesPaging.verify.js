// Pins the ORDER of filter vs paginate vs enrich in getAllFines.
//
// WHY THIS FILE EXISTS: the rescan branch re-queried the fines table unpaged, then
// sliced it (`fullRes.data.slice(offset, offset+limit)`) BEFORE enriching and
// filtering. The consequence is subtle enough that review missed it:
//
//   Search "ana". Suppose the only matching row sits at index 300 of the unfiltered
//   table. Page 1 is sliced to indices 0-24, enriched, filtered -- and comes back
//   EMPTY, while `total` (the full unfiltered length) advertises many pages. The user
//   has to page forward until the row happens to land in their window, with no
//   indication the result set is correct.
//
//   Filtering a slice is not filtering a result set. The two orders differ only when
//   the filter is JS-side, which is why no existing suite caught it: the old suites
//   test filters that ARE pushed down, where slice-then-filter and filter-then-slice
//   agree by construction.
//
// Run: node tests/finesPaging.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder-key";

const USERS = {
  u_ana: { firstName: "Ana", lastName: "Reyes", schoolId: "23-000039", course: "BIT", role: "student", status: "active" },
  u_bob: { firstName: "Bob", lastName: "Cruz", schoolId: "23-000040", course: "BSIT", role: "student", status: "active" },
  u_ana2: { firstName: "Ana", lastName: "Lopez", schoolId: "23-000041", course: "BIT", role: "student", status: "active" },
};

// Transactions are stubbed empty on purpose: `course` resolves from the USER record
// first (USERS), so these rows already carry a course without any transaction data,
// which keeps the assertions about course routing unambiguous. Kept as a record of
// the expected shape rather than silently dropped.
const _TXS_SHAPE = {
  t1: { id: "t1", course: "BIT", school_id: "23-000039", first_name: "Ana", last_name: "Reyes" },
  t2: { id: "t2", course: "BSIT", school_id: "23-000040", first_name: "Bob", last_name: "Cruz" },
  t3: { id: "t3", course: "BIT", school_id: "23-000041", first_name: "Ana", last_name: "Lopez" },
};

// 5 fines. Only f5 and f2 concern an "Ana". Crucially they sit at indices 1 and 4 --
// so under slice-then-filter with limit=2, page 1 (indices 0-1) contains exactly ONE
// match and page 2 (indices 2-3) contains NONE, even though a match exists.
// Under filter-then-slice, page 1 must contain both Ana rows.
const FINES = [
  { id: "f1", user_id: "u_bob", transaction_id: "t2", item_name: "Oscilloscope", status: "unpaid", created_at: "2026-01-05" },
  { id: "f2", user_id: "u_ana", transaction_id: "t1", item_name: "Multimeter", status: "unpaid", created_at: "2026-01-04" },
  { id: "f3", user_id: "u_bob", transaction_id: "t2", item_name: "Power Supply", status: "paid", created_at: "2026-01-03" },
  { id: "f4", user_id: "u_bob", transaction_id: "t2", item_name: "Function Gen", status: "unpaid", created_at: "2026-01-02" },
  { id: "f5", user_id: "u_ana2", transaction_id: "t3", item_name: "Voltmeter", status: "unpaid", created_at: "2026-01-01" },
];

// ── Stubs ────────────────────────────────────────────────────────────────────
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection: (name) => ({
        where: (_f, _op, ids) => ({
          get: async () => ({
            docs: ids
              .filter((id) => name === "users" && USERS[id])
              .map((id) => ({ exists: true, id, data: () => USERS[id] })),
          }),
        }),
      }),
    },
    auth: { verifyIdToken: async () => ({ uid: "admin" }), setCustomUserClaims: async () => {} },
    FieldPath: { documentId: () => "__name__" },
    admin: {},
  },
};

// Records what the controller actually asked of SQL, so the test can assert the
// range was NOT applied when a JS-only filter is in play.
const sqlLog = [];

function makeQuery(initial = []) {
  const state = {
    rows: [...initial],
    eqs: [],
    ranged: null,
    ordered: null,
    inFilter: null,
  };
  const q = {
    select: (_cols, opts) => {
      if (opts && opts.count) state.counted = true;
      return q;
    },
    eq: (col, val) => {
      state.eqs.push([col, val]);
      state.rows = state.rows.filter((r) => r[col] === val);
      return q;
    },
    in: (col, vals) => {
      state.inFilter = [col, vals];
      state.rows = state.rows.filter((r) => vals.includes(r[col]));
      return q;
    },
    order: (col, opts) => {
      state.ordered = [col, opts];
      return q;
    },
    range: (from, to) => {
      state.ranged = [from, to];
      sqlLog.push(["range", from, to]);
      state.rows = state.rows.slice(from, to + 1);
      return q;
    },
    then: (resolve) =>
      Promise.resolve()
        .then(() => {
          // Mirror PostgREST's two-phase behaviour: with count:"exact" the range is
          // applied to the RETURNED rows but the count reflects the whole set.
          const totalRows = state.rows.length + (state.ranged ? FINES.length : 0);
          const rows = state.ranged ? state.rows : [...state.rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return resolve({ data: rows, error: null, count: state.counted ? totalRows : null });
        }),
  };
  return q;
}

const supabasePath = require.resolve("../src/config/supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        if (table === "fines") {
          sqlLog.push(["fines-select"]);
          return makeQuery(FINES);
        }
        if (table === "transactions") return makeQuery([]);
        return makeQuery([]);
      },
    },
  },
};

const { getAllFines } = require("../src/controllers/finesController");

function call(query) {
  return new Promise((resolve) => {
    const req = { query };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    getAllFines(req, res);
  });
}

let failures = 0;
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
}

(async () => {
  // ── 1. The regression: search must not be sliced before filtering ───────────
  console.log("--- search is applied BEFORE pagination ---");
  {
    sqlLog.length = 0;
    const r = await call({ search: "ana", page: "1", limit: "2" });
    const ids = r.body.data.map((d) => d.id);
    check(
      "page 1 of search=ana returns the Ana rows",
      ids.length === 2 && ids.includes("f2") && ids.includes("f5"),
      `got ${JSON.stringify(ids)}`,
    );
    check(
      "  and no non-matching rows leak in",
      !ids.includes("f1") && !ids.includes("f3") && !ids.includes("f4"),
      `got ${JSON.stringify(ids)}`,
    );
    check(
      "total counts MATCHES, not table rows",
      r.body.pagination?.total === 2,
      `got ${JSON.stringify(r.body.pagination)}`,
    );
  }
  {
    // The specific shape that failed before: a page window with no matches, under a
    // result set that has matches.
    const r = await call({ search: "ana", page: "1", limit: "1" });
    check(
      "limit=1 page 1 of search=ana is the first Ana row, not empty",
      r.body.data.length === 1 && r.body.data[0].id === "f2",
      `got ${JSON.stringify(r.body.data.map((d) => d.id))}`,
    );
    const r2 = await call({ search: "ana", page: "2", limit: "1" });
    check(
      "limit=1 page 2 of search=ana is the second Ana row",
      r2.body.data.length === 1 && r2.body.data[0].id === "f5",
      `got ${JSON.stringify(r2.body.data.map((d) => d.id))}`,
    );
  }

  // ── 2. SQL is not ranged when the filter is JS-side ────────────────────────
  console.log("--- no SQL range when a JS-only filter is present ---");
  {
    sqlLog.length = 0;
    await call({ search: "ana", page: "1", limit: "2" });
    check(
      "no range() was pushed to SQL",
      !sqlLog.some((e) => e[0] === "range"),
      `sql: ${JSON.stringify(sqlLog)}`,
    );
  }
  {
    // The cheap path must still be taken when the only predicate is indexed.
    sqlLog.length = 0;
    await call({ status: "unpaid", page: "1", limit: "2" });
    check(
      "status-only DOES push a range to SQL (cheap path preserved)",
      sqlLog.some((e) => e[0] === "range"),
      `sql: ${JSON.stringify(sqlLog)}`,
    );
  }

  // ── 3. course filter (also JS-only) behaves the same ───────────────────────
  console.log("--- course is filtered before pagination ---");
  {
    const r = await call({ course: "BSIT", page: "1", limit: "10" });
    const ids = r.body.data.map((d) => d.id);
    check(
      "course=BSIT returns only BSIT rows",
      ids.length === 3 && ids.every((id) => ["f1", "f3", "f4"].includes(id)),
      `got ${JSON.stringify(ids)}`,
    );
    check(
      "  total matches the filtered count",
      r.body.pagination?.total === 3,
      `got ${JSON.stringify(r.body.pagination)}`,
    );
  }
  {
    const r = await call({ course: "BIT", page: "1", limit: "1" });
    check(
      "course=BIT paginates over BIT rows only",
      r.body.pagination?.total === 2 && r.body.data.length === 1,
      `got ${JSON.stringify(r.body.pagination)} rows=${JSON.stringify(r.body.data.map((d) => d.id))}`,
    );
  }

  // ── 4. status + JS filter compose, and status still pushed to SQL ──────────
  console.log("--- status and the JS filter compose ---");
  {
    const r = await call({ status: "unpaid", search: "ana", page: "1", limit: "10" });
    const ids = r.body.data.map((d) => d.id);
    check(
      "status=unpaid AND search=ana intersects correctly",
      ids.length === 2 && ids.every((id) => ["f2", "f5"].includes(id)),
      `got ${JSON.stringify(ids)}`,
    );
  }
  {
    const r = await call({ status: "paid", search: "ana", page: "1", limit: "10" });
    check(
      "a filter combination with no matches returns empty, not junk",
      r.body.data.length === 0,
      `got ${JSON.stringify(r.body.data.map((d) => d.id))}`,
    );
    check(
      "  with total 0 rather than the table size",
      r.body.pagination?.total === 0,
      `got ${JSON.stringify(r.body.pagination)}`,
    );
  }

  // ── 5. Unpaginated still works (kiosk / exports) ───────────────────────────
  console.log("--- unpaginated requests are filtered, not served whole ---");
  {
    const r = await call({ search: "ana" });
    check(
      "unpaginated search returns all matches",
      Array.isArray(r.body) && r.body.length === 2,
      `got ${Array.isArray(r.body) ? JSON.stringify(r.body.map((d) => d.id)) : JSON.stringify(r.body)}`,
    );
    check(
      "  and no non-matching rows",
      Array.isArray(r.body) && r.body.every((d) => /ana/i.test(`${d.userName} ${d.itemName}`)),
      `got ${JSON.stringify(r.body.map((d) => d.id))}`,
    );
  }
  {
    // Regression guard: the refactor that fixed paginated search initially moved the
    // filter inside the needsRescan branch, which made UNPAGINATED callers ignore
    // search and course entirely.
    const r = await call({ course: "BIT" });
    check(
      "unpaginated course filter is applied",
      Array.isArray(r.body) && r.body.length === 2 && r.body.every((d) => d.course === "BIT"),
      `got ${JSON.stringify(r.body.map((d) => `${d.id}:${d.course}`))}`,
    );
  }
  {
    const r = await call({ status: "paid" });
    check(
      "unpaginated status filter still works (SQL side)",
      Array.isArray(r.body) && r.body.length === 1 && r.body[0].id === "f3",
      `got ${JSON.stringify(r.body.map((d) => d.id))}`,
    );
  }

  // ── 6. no course column is pushed into SQL ─────────────────────────────────
  // PostgREST answers 42703 for an unknown column, which 500s the whole endpoint.
  console.log("--- fines has no course column in SQL ---");
  {
    sqlLog.length = 0;
    await call({ course: "BIT", page: "1", limit: "5" });
    check(
      "the rescan does not filter on a nonexistent column",
      true, // asserted structurally below via the controller source
    );
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "controllers", "finesController.js"),
      "utf8",
    );
    const getAllFinesSrc = src.slice(src.indexOf("const getAllFines"), src.indexOf("const getMyFines"));
    check(
      'no .eq("course" anywhere in getAllFines',
      !/\.eq\(\s*"course"/.test(getAllFinesSrc),
      "found a course predicate against a column that does not exist",
    );
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("test harness error:", err);
  process.exit(1);
});