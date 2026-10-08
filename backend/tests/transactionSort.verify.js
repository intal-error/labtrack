/**
 * Verifies the ?sort= query param on the student transaction endpoints.
 *
 * Why a controller test and not just a sortTransactions() util test: the bug was
 * never in the helper. getMyBorrowed/getMyReturned hardcoded a newest-first
 * comparator and never read req.query.sort, so util tests passed happily while
 * the "Name A-Z" option silently did nothing. These assertions call the real
 * controllers.
 *
 * The load-bearing case is `page=1&limit=2`: sorting happens before pagination,
 * so a correct implementation returns the globally-first 2 rows, whereas the old
 * code returned the first 2 of the default newest-first order.
 *
 * Run: node backend/tests/transactionSort.verify.js
 */
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

const { applyOr } = require("./helpers/orFilter");

const BORROWED = [
  { id: "b1", user_id: "u1", action: "borrowed", status: "borrowed", first_name: "Zoe", last_name: "Adams", quantity: 1, course: "BIT", timestamp: "2026-01-05T00:00:00Z" },
  { id: "b2", user_id: "u1", action: "borrowed", status: "borrowed", first_name: "Ana", last_name: "Reyes", quantity: 5, course: "CT", timestamp: "2026-03-05T00:00:00Z" },
  { id: "b3", user_id: "u1", action: "borrowed", status: "borrowed", first_name: "Marc", last_name: "Lawrence", quantity: 3, course: "BIT", timestamp: "2026-02-05T00:00:00Z" },
  { id: "b4", user_id: "u1", action: "borrowed", status: "borrowed", first_name: "Jude", last_name: "Santos", quantity: 9, course: "MT", timestamp: "2026-04-05T00:00:00Z" },
];

const RETURNED = BORROWED.map((r) => ({
  ...r,
  id: r.id.replace("b", "r"),
  action: "returned",
  status: "returned",
  borrowed_at: r.timestamp,
  returned_quantity: r.quantity,
}));

/**
 * Query-builder stub that actually executes the predicates.
 *
 * It used to ignore every filter and hand back the whole action bucket, with the
 * comment "the endpoints filter and sort in Node afterwards". That was true when
 * queryTransactions pushed nothing into SQL; it now pushes course, year and the
 * date range down, so a stub that ignores them would let a broken pushdown pass
 * this suite unnoticed -- which is exactly the regression this file exists to
 * catch. The predicates below are the real contract.
 */
function makeChain(initial) {
  let rows = [...initial];
  const chain = {
    select: () => chain,
    eq: (k, v) => {
      rows = rows.filter((r) => String(r[k]) === String(v));
      return chain;
    },
    // Values arrive QUOTED (utils/postgrest.js orEq), so a comma inside a course name
    // must not be read as a clause separator. See tests/helpers/orFilter.js.
    or: (expr) => {
      rows = applyOr(rows, expr);
      return chain;
    },
    gte: (k, v) => { rows = rows.filter((r) => new Date(r[k]) >= new Date(v)); return chain; },
    lte: (k, v) => { rows = rows.filter((r) => new Date(r[k]) <= new Date(v)); return chain; },
    order: (k, opts = {}) => {
      const dir = opts.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = k === "timestamp" ? new Date(a[k]).getTime() : a[k];
        const bv = k === "timestamp" ? new Date(b[k]).getTime() : b[k];
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
      return chain;
    },
    in: () => chain,
    then: (resolve, reject) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject),
  };
  return chain;
}

let CURRENT_ACTION = "borrowed";

stub("../src/config/supabase", {
  supabase: {
    from: () => makeChain(CURRENT_ACTION === "borrowed" ? BORROWED : RETURNED),
  },
});
// FieldPath is exported by config/firebase for batched `where(documentId(), "in")`
// reads, which enrichWithProfileURL now uses instead of N individual doc gets.
stub("../src/config/firebase", {
  db: {
    collection: () => ({
      doc: () => ({ get: () => Promise.resolve({ exists: false }) }),
      where: () => ({ get: async () => ({ docs: [], empty: true }) }),
    }),
  },
  FieldPath: { documentId: () => "__name__" },
});

const { getMyBorrowed, getMyReturned } = require("../src/controllers/transactionController");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function mockRes() {
  return {
    payload: undefined,
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

async function call(handler, action, query) {
  CURRENT_ACTION = action;
  const res = mockRes();
  await handler({ user: { uid: "u1" }, query }, res);
  return res.payload;
}

const ids = (payload) => payload.data.map((r) => r.id);

(async () => {
  console.log("--- getMyBorrowed: ?sort= is honoured ---");

  check("no sort defaults to date-desc (newest first)",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25" })),
    ["b4", "b2", "b3", "b1"]);

  // Name order is by FIRST name: Ana Reyes, Jude Santos, Marc Lawrence, Zoe Adams.
  check("sort=name-asc sorts ALL rows before paginating",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "name-asc" })),
    ["b2", "b4", "b3", "b1"]);

  check("sort=name-desc",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "name-desc" })),
    ["b1", "b3", "b4", "b2"]);

  check("sort=qty-desc",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "qty-desc" })),
    ["b4", "b2", "b3", "b1"]);

  check("sort=qty-asc",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "qty-asc" })),
    ["b1", "b3", "b2", "b4"]);

  check("sort=date-asc",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "date-asc" })),
    ["b1", "b3", "b2", "b4"]);

  console.log("--- the load-bearing case: sort + pagination together ---");
  // Old behaviour returned ["b4","b2"] (first 2 of newest-first) for BOTH of
  // these, because the endpoint paginated without ever reading ?sort=.
  check("name-asc, page 1 of 2-per-page is the global first page",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "2", sort: "name-asc" })),
    ["b2", "b4"]);

  check("qty-desc, page 1 of 2-per-page is the global first page",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "2", sort: "qty-desc" })),
    ["b4", "b2"]);

  check("name-asc, page 2 continues the global order",
    ids(await call(getMyBorrowed, "borrowed", { page: "2", limit: "2", sort: "name-asc" })),
    ["b3", "b1"]);

  console.log("--- pagination metadata is unaffected by sort ---");
  const paged = await call(getMyBorrowed, "borrowed", { page: "1", limit: "2", sort: "name-asc" });
  check("total", paged.pagination.total, 4);
  check("totalPages", paged.pagination.totalPages, 2);
  check("page", paged.pagination.page, 1);

  console.log("--- search still works alongside sort ---");
  // The student endpoints search item_name + course only (documented asymmetry
  // vs the admin endpoints), so search on the course, not on the borrower name.
  check("search=BIT (b1 Zoe Adams, b3 Marc Lawrence) + sort=name-asc",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "name-asc", search: "BIT" })),
    ["b3", "b1"]);

  check("search on a borrower name matches nothing (student scope)",
    ids(await call(getMyBorrowed, "borrowed", { page: "1", limit: "25", sort: "name-asc", search: "reyes" })),
    []);

  console.log("--- getMyReturned: ?sort= is honoured ---");

  check("no sort defaults to date-desc",
    ids(await call(getMyReturned, "returned", { page: "1", limit: "25" })),
    ["r4", "r2", "r3", "r1"]);

  check("sort=name-asc",
    ids(await call(getMyReturned, "returned", { page: "1", limit: "25", sort: "name-asc" })),
    ["r2", "r4", "r3", "r1"]);

  check("sort=qty-asc + pagination is global",
    ids(await call(getMyReturned, "returned", { page: "1", limit: "2", sort: "qty-asc" })),
    ["r1", "r3"]);

  console.log("--- closed loans stay excluded from Borrowed ---");
  // Sanity: a fully-returned row must not appear on the borrowed tab.
  const closed = BORROWED.map((r, i) => (i === 0 ? { ...r, status: "returned", returned_quantity: r.quantity } : r));
  const original = BORROWED.slice();
  BORROWED.length = 0;
  BORROWED.push(...closed);
  const afterClose = await call(getMyBorrowed, "borrowed", { page: "1", limit: "25" });
  BORROWED.length = 0;
  BORROWED.push(...original);
  check("closed loan is excluded", ids(afterClose).includes("b1"), false);
  check("other loans remain", ids(afterClose), ["b4", "b2", "b3"]);

  console.log("");
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
})();