/**
 * Verifies the paging contract behind the catalog totals.
 *
 * The bug this pins: PostgREST caps a response at `max-rows` (1000 by default)
 * and signals nothing when it does — it just returns its first N rows. A plain
 * `select("*")` therefore made the dashboard's totals come up short, dropped the
 * tail of a paginated catalog listing, and cut the Excel export off at the cap.
 *
 * The existing catalogFilters suite stubs supabase with `select: () => Promise`,
 * so it can only ever exercise the single-read path. This one supplies a real
 * thenable builder (`select().range().order()`) plus a count header, which is
 * the only way the paged branch gets any coverage at all.
 *
 * Run: node backend/tests/catalogPaging.verify.js
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

// ── A PostgREST stand-in ────────────────────────────────────────────────────
// `CAP` plays the role of the project's max-rows setting. It is deliberately
// NOT 1000, because the whole point of isTruncated is that it must not assume a
// batch size — the original guard compared against 1000 and would have declared
// a 500-row truncated response complete.
const TABLE = [];
let CAP = 1000;
let queries = 0;

/**
 * supabase-js builders are thenable and chainable, and the resolved value only
 * materialises when awaited. Mirroring that matters: fetchAll calls
 * `build().range(from, to)` and awaits the *builder*, not a promise.
 */
function respond(range, opts) {
  queries += 1;
  const sorted = [...TABLE].sort((a, b) => (a.id < b.id ? -1 : 1));
  const start = range && typeof range.from === "number" ? range.from : 0;
  const end = range && typeof range.to === "number" ? range.to : start + CAP - 1;
  const slice = sorted.slice(start, end + 1);
  return {
    // The cap applies to whatever the range asked for, which is how PostgREST
    // truncates: silently, with no error and no indication in the payload.
    data: slice.slice(0, CAP),
    error: null,
    count: opts && opts.count === "exact" ? TABLE.length : null,
  };
}

function makeBuilder() {
  let range = null;
  let opts = null;
  const builder = {
    select(_cols, o) {
      opts = o || null;
      return builder;
    },
    order() {
      return builder;
    },
    eq() {
      return builder;
    },
    range(from, to) {
      range = { from, to };
      return builder;
    },
    then(resolve, reject) {
      try {
        resolve(respond(range, opts));
      } catch (err) {
        reject(err);
      }
    },
  };
  return builder;
}

stub("../src/config/supabase", { supabase: { from: () => makeBuilder() } });
stub("../src/config/firebase", {
  db: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) },
});

const { fetchAll, isTruncated } = require("../src/utils/fetchAll");
const { getAll, getStats } = require("../src/controllers/catalogController");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function seed(total) {
  TABLE.length = 0;
  for (let i = 1; i <= total; i++) {
    TABLE.push({
      id: String(i).padStart(5, "0"),
      item_name: `ITEM ${i}`,
      category: i % 2 ? "Equipment" : "Tools",
      course: ["BIT", "CT", "MT"][i % 3],
      quantity: 2,
      available_quantity: 2,
      status: "Available",
      condition: "Good",
    });
  }
  queries = 0;
}

(async () => {
  console.log("--- isTruncated: never assumes the cap is 1000 ---");
  // The regression: a cap below 1000 must still read as truncated.
  check("a 500-row response of 1500 rows is truncated", isTruncated(1500, 500), true);
  check("a complete 1500-row response is not truncated", isTruncated(1500, 1500), false);
  check("a count that is not a number cannot be trusted", isTruncated(null, 500), false);
  check("an unknown count cannot be trusted", isTruncated(undefined, 500), false);
  check("zero rows of zero is not truncated", isTruncated(0, 0), false);

  console.log("--- fetchAll: pages to completion ---");
  CAP = 500;
  seed(1200);
  const paged = await fetchAll(() => makeBuilder().select("*", { count: "exact" }));
  check("every row is returned exactly once", paged.length, 1200);
  check("no duplicate ids across pages", new Set(paged.map((r) => r.id)).size, 1200);
  check(
    "ids are contiguous, so no page was skipped",
    paged.map((r) => r.id),
    TABLE.map((r) => r.id)
  );

  CAP = 500;
  seed(300);
  const single = await fetchAll(() => makeBuilder().select("*", { count: "exact" }));
  check("a catalog under the cap costs one request", queries, 1);
  check("a catalog under the cap returns everything", single.length, 300);

  console.log("--- fetchAll: pages even with no count header ---");
  CAP = 500;
  seed(900);
  queries = 0;
  const noCount = await fetchAll(() => makeBuilder().select("*"));
  check("an unknown count still pages to the end", noCount.length, 900);

  console.log("--- getAll: the cap must not silently shorten the catalog ---");
  CAP = 500;
  seed(1200);
  queries = 0;
  const res = new mockRes();
  await getAll({ query: {} }, res);
  const rows = Array.isArray(res.body) ? res.body : res.body.data;
  check("getAll returns all 1200 rows", rows.length, 1200);
  check("getAll re-read paged rather than trusting the short read", queries > 1, true);
  check("every id survives", new Set(rows.map((r) => r.id)).size, 1200);

  console.log("--- getAll: a complete read is left alone ---");
  CAP = 1000;
  seed(120);
  queries = 0;
  const res2 = new mockRes();
  await getAll({ query: {} }, res2);
  check("a 120-row catalog costs exactly one query", queries, 1);
  check("all 120 rows come back", (Array.isArray(res2.body) ? res2.body : res2.body.data).length, 120);

  console.log("--- getAll: filtering still applies over the whole catalog ---");
  CAP = 500;
  seed(1200);
  const res3 = new mockRes();
  await getAll({ query: { course: "CT" } }, res3);
  const filtered = Array.isArray(res3.body) ? res3.body : res3.body.data;
  check("a course filter covers rows past the cap", filtered.length, 400);
  check("only that course comes back", [...new Set(filtered.map((r) => r.course))], ["CT"]);

  console.log("--- getStats: totals cover the whole catalog ---");
  CAP = 500;
  seed(1200);
  const res4 = new mockRes();
  await getStats({ query: {} }, res4);
  check("total counts every row", res4.body.total, 1200);
  check("available counts every row", res4.body.available, 1200);
  check("per-course counts cover the whole catalog", res4.body.byCourse.reduce((s, c) => s + c.total, 0), 1200);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
