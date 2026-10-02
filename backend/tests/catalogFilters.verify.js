/**
 * Verifies the catalog query contract the redesigned UI depends on:
 *  - the new `category` and `condition` filters actually narrow the result set
 *  - they compose with search / status / course, and "All" stays a no-op
 *  - getStats reports totalQuantity (the 4th KPI tile)
 *  - assetTag survives catalogCreateSchema (it used to be stripped, so the
 *    controller read data.assetTag === undefined and wrote "")
 *
 * Run: node backend/tests/catalogFilters.verify.js
 */
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// The controller pulls in the real Supabase + Firebase Admin clients at require
// time. Swap them for in-memory stubs before it loads.
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

const ROWS = [
  { id: "1", item_name: "OSCILLOSCOPE", category: "Equipment", course: "BIT", quantity: 4, available_quantity: 3, status: "Available", condition: "Excellent", barcode: "BC-001", asset_tag: "AT-001" },
  { id: "2", item_name: "MULTIMETER", category: "Equipment", course: "BIT", quantity: 6, available_quantity: 0, status: "Borrowed", condition: "Good", barcode: "", asset_tag: "" },
  { id: "3", item_name: "SCREWDRIVER SET", category: "Tools", course: "CT", quantity: 12, available_quantity: 12, status: "Available", condition: "Fair", barcode: "BC-003", asset_tag: "AT-003" },
  { id: "4", item_name: "BROKEN PROBE", category: "Tools", course: "", quantity: 2, available_quantity: 0, status: "Borrowed", condition: "Damaged", barcode: "", asset_tag: "" },
];

const selects = [];
stub("../src/config/supabase", {
  supabase: {
    from: (table) => ({
      select: (cols) => {
        selects.push(`${table}:${cols}`);
        return Promise.resolve({ data: ROWS, error: null });
      },
    }),
  },
});
stub("../src/config/firebase", { db: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });

const { getAll, getStats } = require("../src/controllers/catalogController");
const { catalogCreateSchema } = require("../src/middleware/validate");

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
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

async function ids(query) {
  const res = mockRes();
  await getAll({ query }, res);
  if (!Array.isArray(res.payload)) throw new Error(`expected an array, got ${JSON.stringify(res.payload)}`);
  return res.payload.map((r) => r.id);
}

(async () => {
  console.log("--- getAll: category / condition filters ---");

  check("no filters returns everything", await ids({}), ["1", "2", "3", "4"]);
  check('category="All" is a no-op', await ids({ category: "All" }), ["1", "2", "3", "4"]);
  check('category="Tools"', await ids({ category: "Tools" }), ["3", "4"]);
  check('category="Equipment"', await ids({ category: "Equipment" }), ["1", "2"]);
  check('condition="Excellent"', await ids({ condition: "Excellent" }), ["1"]);
  check('condition="Damaged"', await ids({ condition: "Damaged" }), ["4"]);
  check('category + condition combine', await ids({ category: "Tools", condition: "Fair" }), ["3"]);

  console.log("--- getAll: composes with the pre-existing filters ---");

  check('status="Available"', await ids({ status: "Available" }), ["1", "3"]);
  check('course="BIT"', await ids({ course: "BIT" }), ["1", "2"]);
  check('course="Unassigned" catches the blank course', await ids({ course: "Unassigned" }), ["4"]);
  check("search matches item_name", await ids({ search: "multi" }), ["2"]);
  check("search matches barcode", await ids({ search: "bc-001" }), ["1"]);
  check("search matches asset_tag", await ids({ search: "AT-003" }), ["3"]);
  check('search + category', await ids({ search: "probe", category: "Tools" }), ["4"]);
  check('category + status + course', await ids({ category: "Equipment", status: "Borrowed", course: "BIT" }), ["2"]);

  console.log("--- getAll: pagination ---");

  const paged = mockRes();
  await getAll({ query: { page: "2", limit: "2", sort: "name" } }, paged);
  // sort=name is A-Z: BROKEN PROBE(4), MULTIMETER(2), OSCILLOSCOPE(1), SCREWDRIVER SET(3)
  check("page 2 of 4 rows sorted by name", paged.payload.data.map((r) => r.id), ["1", "3"]);
  check("pagination.total", paged.payload.pagination.total, 4);
  check("pagination.totalPages", paged.payload.pagination.totalPages, 2);

  const firstPage = mockRes();
  await getAll({ query: { page: "1", limit: "2", sort: "name" } }, firstPage);
  check("page 1 of the same sort", firstPage.payload.data.map((r) => r.id), ["4", "2"]);

  console.log("--- getStats ---");

  const statsRes = mockRes();
  await getStats({ query: {} }, statsRes);
  check("total", statsRes.payload.total, 4);
  check("available", statsRes.payload.available, 2);
  check("borrowed", statsRes.payload.borrowed, 2);
  check("categories", statsRes.payload.categories, 2);
  check("totalQuantity sums quantity", statsRes.payload.totalQuantity, 24);
  check("byCourse buckets the blank course as Unassigned",
    statsRes.payload.byCourse.map((c) => `${c.course}:${c.total}`),
    ["BIT:2", "CT:1", "Unassigned:1"]);

  console.log("--- catalogCreateSchema ---");

  const valid = catalogCreateSchema.safeParse({
    itemName: "OSCILLOSCOPE",
    category: "Equipment",
    course: "BIT",
    quantity: 4,
    condition: "Excellent",
    status: "Available",
    imageUrl: "https://example.com/a.png",
    barcode: "BC-001",
    assetTag: "AT-001",
  });
  check("a valid payload parses", valid.success, true);
  check("assetTag is preserved (used to be stripped)", valid.success && valid.data.assetTag, "AT-001");

  check("quantity 0 is rejected", catalogCreateSchema.safeParse({ itemName: "X", category: "Tools", course: "BIT", quantity: 0, condition: "Good" }).success, false);
  check("fractional quantity is rejected", catalogCreateSchema.safeParse({ itemName: "X", category: "Tools", course: "BIT", quantity: 1.5, condition: "Good" }).success, false);
  check("blank course is rejected", catalogCreateSchema.safeParse({ itemName: "X", category: "Tools", course: "", quantity: 1, condition: "Good" }).success, false);
  check("unknown status is rejected", catalogCreateSchema.safeParse({ itemName: "X", category: "Tools", course: "BIT", quantity: 1, condition: "Good", status: "Retired" }).success, false);
  check("missing condition is rejected", catalogCreateSchema.safeParse({ itemName: "X", category: "Tools", course: "BIT", quantity: 1 }).success, false);

  console.log("");
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
})();