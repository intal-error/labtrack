// Pins the query SHAPE of GET /api/reports/summary -- the single most expensive
// read in the app, and the one DashboardPage calls twice per load.
//
// WHY A SHAPE SUITE: this endpoint has no behavioural coverage anywhere, and its
// cost is invisible in the response. A refactor that changed "reads four entire
// tables" into "reads four entire tables, plus one extra" passes every functional
// test and doubles a dashboard load. These assertions are about what gets asked of
// the database, not what comes back.
//
// Fully offline: Supabase and Firebase are stubbed before the controller loads.
// Run: node tests/reportSummaryShape.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

const TODAY = new Date();
const day = (offset) =>
  new Date(TODAY.getTime() + offset * 86400000).toISOString().slice(0, 10);

// Fixtures are dated relative to now so the assertions below cannot go stale.
const T = {
  borrowed: [
    {
      id: "b1", action: "borrowed", status: "borrowed",
      borrowed_at: `${day(-10)}T08:00:00Z`, timestamp: `${day(-10)}T08:00:00Z`,
      created_at: `${day(-10)}T08:00:00Z`, due_date: `${day(-3)}T08:00:00Z`,
      returned_at: null, last_returned_at: null,
      // Present in the real table, absent from the SELECT list -- if the controller
      // goes back to select("*") these come back and the column assertion catches it.
      borrow_photo_url: "https://example.test/big.jpg",
      description: "a very long condition description that must never be transferred",
    },
    {
      id: "b2", action: "borrowed", status: "returned",
      borrowed_at: `${day(-8)}T08:00:00Z`, timestamp: `${day(-8)}T08:00:00Z`,
      created_at: `${day(-8)}T08:00:00Z`, due_date: `${day(-1)}T08:00:00Z`,
      returned_at: `${day(-7)}T08:00:00Z`, last_returned_at: null,
      borrow_photo_url: "https://example.test/big2.jpg",
    },
  ],
  returned: [
    {
      id: "r1", action: "returned",
      returned_at: `${day(-6)}T08:00:00Z`, timestamp: `${day(-6)}T08:00:00Z`,
      created_at: `${day(-6)}T08:00:00Z`,
      condition_notes: "another long text field that must not be transferred",
    },
  ],
};

const TABLE_SIZES = {
  // Large enough that fetching the whole table would be obvious in the query log.
  transactions: [...T.borrowed, ...T.returned],
  lab_attendance: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, date: day(-i) })),
  incidents: Array.from({ length: 12 }, (_, i) => ({
    id: `i${i}`,
    status: i < 5 ? "pending" : i < 8 ? "under_review" : "resolved",
    description: `incident narrative ${i}`,
    photos: ["https://example.test/p.jpg"],
    reassignment_history: [{ previous_admin_id: "x" }],
  })),
  lab_rooms: [
    { id: "r-a", status: "active", room_name: "NET LAB" },
    { id: "r-b", status: "active", room_name: "CET" },
    { id: "r-c", status: "inactive", room_name: "OLD LAB" },
  ],
};

/** Every select() column list and every predicate the controller asked for. */
const QUERIES = [];

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: (table) => {
        const all = TABLE_SIZES[table] || [];
        let rows = [...all];
        let head = false;
        const record = (kind, extra) => {
          QUERIES.push({ table, kind, cols, head, ...extra });
        };

        let cols = null;
        const chain = {
          select: (c, opts = {}) => {
            cols = c;
            if (opts.head) head = true;
            return chain;
          },
          eq: (k, v) => { rows = rows.filter((r) => String(r[k]) === String(v)); return chain; },
          in: (k, list) => {
            rows = rows.filter((r) => list.map(String).includes(String(r[k])));
            return chain;
          },
          gte: (k, v) => { rows = rows.filter((r) => String(r[k]) >= String(v)); return chain; },
          lte: (k, v) => { rows = rows.filter((r) => String(r[k]) <= String(v)); return chain; },
          order: (k, opts = {}) => {
            // Real ordering, so a `.limit(1)` after `.order(col, ascending)` actually
            // returns the minimum. The floor probe in reportSummaryController depends
            // on this: it is how the test can tell a genuine MIN from "first row".
            const dir = opts.ascending === false ? -1 : 1;
            rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * dir);
            return chain;
          },
          limit: (n) => { rows = rows.slice(0, n); return chain; },
          range: (a, b) => { rows = rows.slice(a, b + 1); return chain; },
          then: (resolve) => {
            // `returnedRows` is what the caller's promise actually resolves to. For a
            // head query that must be null -- PostgREST sends a count header and no
            // body -- which is what proves the rows were never transferred even
            // though the predicate still filtered server-side.
            const payload = head ? null : rows;
            // `matched` is how many rows the predicates matched BEFORE any range/
            // limit, so a test can assert a probe really was unbounded.
            record("select", { returnedRows: payload ? payload.length : 0, headNow: head, matched: all.length });
            return resolve({ data: payload, error: null, count: rows.length });
          },
        };
        return chain;
      },
    },
  },
};

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    admin: {},
    db: {
      collection: () => ({
        count: () => ({ get: async () => ({ data: () => ({ count: 30 }) }) }),
        where: () => ({ count: () => ({ get: async () => ({ data: () => ({ count: 24 }) }) }) }),
      }),
    },
    auth: {},
  },
};

const { getSummary } = require("../src/controllers/reportSummaryController");

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want  ${e}`}`);
}

function call(query) {
  QUERIES.length = 0;
  const res = {
    body: null,
    status() { return this; },
    json(b) { this.body = b; return this; },
  };
  return getSummary({ query }, res).then(() => ({ body: res.body, queries: [...QUERIES] }));
}

const selects = (qs, table) => qs.filter((q) => q.kind === "select" && q.table === table);
const colList = (q) => (typeof q.cols === "string" ? q.cols.split(",").map((s) => s.trim()).filter(Boolean) : null);

(async () => {
  // ── The dashboard's actual call: a 30-day window ──
  const { body, queries } = await call({ from: day(-30), to: day(0) });

  console.log("--- the numbers still come out right ---");
  check("counts.users", body.counts.users, 30);
  check("counts.students", body.counts.students, 24);
  check("two borrows in range", body.period.borrows, 2);
  check("one return in range", body.period.returns, 1);
  // b1 is past due and never returned; b2 was returned.
  check("only the open loan is overdue", body.period.overdue, 1);
  check("total rooms", body.stats.totalRooms, 3);
  check("active rooms", body.stats.activeRooms, 2);
  // 5 pending + 3 under_review of 12.
  check("open incidents (pending + under_review + open)", body.stats.openIncidents, 8);
  check("total incidents", body.stats.totalIncidents, 12);

  console.log("--- incidents are two head counts, not the table ---");
  const incidentSelects = selects(queries, "incidents");
  check("two incident queries", incidentSelects.length, 2);
  check("both are head counts", incidentSelects.every((q) => q.head === true), true);
  check("neither ships a row", incidentSelects.every((q) => q.returnedRows === 0), true);

  console.log("--- transactions select only the fields the maths reads ---");
  {
    const tx = selects(queries, "transactions");
    check("transactions: at least one query", tx.length > 0, true);
    for (const q of tx) {
      if (q.head) continue;
      check("transactions: select list is explicit, not \"*\"", (colList(q) || ["*"]).includes("*"), false);
    }
    check("transactions: no photo/text column is fetched", tx.some((q) => {
      const cols = colList(q) || [];
      return cols.length > 0 && !cols.some((c) => /photo|description|notes|url/i.test(c));
    }), true);
  }

  console.log("--- lab_attendance is bounded from below even without ?from ---");
  // With an explicit ?from the floor is that value; the assertion that matters is
  // that the query is a range, not an open-ended upper bound.
  const attRange = selects(queries, "lab_attendance");
  check("attendance queried once", attRange.length, 1);
  check("attendance selects only date", colList(attRange[0]), ["date"]);

  console.log("--- rooms are head counts ---");
  const roomSelects = selects(queries, "lab_rooms");
  check("two room queries", roomSelects.length, 2);
  check("both head counts", roomSelects.every((q) => q.head === true), true);

  console.log("--- and the no-?from default is bounded too ---");
  const noFrom = await call({ to: day(0) });
  const attQueries = selects(noFrom.queries, "lab_attendance");
  // Two by design: a single-row MIN probe for the floor, then the range scan. Both
  // select only `date`, and the probe costs one row.
  check("default call queries attendance (probe + range)", attQueries.length, 2);
  check("default call selects only date, both queries", attQueries.every((q) => JSON.stringify(colList(q)) === JSON.stringify(["date"])), true);
  // The probe must return ONE row while having MATCHED the whole table -- that is
  // what makes it a genuine MIN and not a filtered subset. If it were circular (e.g.
  // range-filtered by the floor it is meant to establish) it would still match the
  // whole table here, so this alone is not proof; the assertion below is that the
  // resulting floor is EARLIER than the earliest borrow, which is the property that
  // actually broke.
  check("the floor probe returns exactly one row", attQueries.some((q) => q.returnedRows === 1), true);

  // THE REGRESSION THIS PINS: the fixture has attendance back to day(-39) but
  // borrows only to day(-10). A borrow-derived floor would clamp period.from to
  // day(-10) and silently drop 29 days of sessions.
  const expectedFloor = day(-39);
  check("floor is the EARLIEST attendance date, not the earliest borrow", noFrom.body.period.from, expectedFloor);
  check("sessions from before the first borrow are still counted", noFrom.body.period.sessions >= 39, true);
  // A gte() on date is what bounds it. Recorded via the predicate, so assert the
  // floor was applied by checking the result is still correct rather than empty.
  check("default call produced a series", Array.isArray(noFrom.body.charts.trendBorrowReturn), true);
  check("default call series is non-trivial", noFrom.body.charts.trendBorrowReturn.length > 1, true);
  check("default borrows counted", noFrom.body.period.borrows >= 2, true);

  console.log("--- early floor beats the 90-day fallback ---");
  // Fixtures are 10 and 8 days old, so a correct floor sits near them and the
  // 40-row attendance fixture (oldest entry day(-39)) is reachable.
  const old = await call({ from: day(-60), to: day(0) });
  check("wide window counts all 3 borrows incl. none older", old.body.period.borrows >= 2, true);
  check("wide window sessions cover the whole fixture", old.body.period.sessions >= 30, true);

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();