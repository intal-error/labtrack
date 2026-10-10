/**
 * Verifies course scoping on the catalog / inventory surface.
 *
 * WHY THIS IS A SEPARATE FILE: catalogFilters.verify.js stubs `select()` to return
 * a bare Promise, because everything it tests is applied in JavaScript AFTER the
 * read. That stub cannot express `.in("course", [...])`, so it would have passed
 * unchanged whether or not the scope existed -- i.e. it cannot fail. This file
 * uses a chainable stub that actually executes the predicate, so a missing scope
 * shows up as a leak instead of silence.
 *
 * Four of these endpoints had NO course check at all before this, and the list
 * filter was not enough to fix them: a row hidden on the list is still served by
 * /:id, by /lookup/barcode/:code and by the /options picker.
 *
 * Run: node backend/tests/catalogScope.verify.js
 */

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [] };
}

const ROWS = [
  { id: "1", item_name: "OSCILLOSCOPE", category: "Equipment", course: "BIT", quantity: 4, available_quantity: 3, status: "Available", condition: "Excellent", barcode: "BC-001", asset_tag: "AT-001" },
  { id: "2", item_name: "MULTIMETER", category: "Equipment", course: "BIT", quantity: 6, available_quantity: 0, status: "Borrowed", condition: "Good", barcode: "BC-002", asset_tag: "AT-002" },
  { id: "3", item_name: "SCREWDRIVER SET", category: "Tools", course: "CT", quantity: 12, available_quantity: 12, status: "Available", condition: "Fair", barcode: "BC-003", asset_tag: "AT-003" },
  // No course at all: fail-closed data, visible to the Super Admin only.
  { id: "4", item_name: "BROKEN PROBE", category: "Tools", course: "", quantity: 2, available_quantity: 0, status: "Borrowed", condition: "Damaged", barcode: "BC-004", asset_tag: "AT-004" },
];

const written = { inserted: [], updated: [], deleted: [] };

/** Chainable stub that really executes eq/in, so an absent scope is visible. */
function catalogTable() {
  let working = [...ROWS];

  const chain = {
    select: () => chain,
    eq(column, value) {
      working = working.filter((r) => String(r[column]) === String(value));
      return chain;
    },
    in(column, values) {
      working = working.filter((r) => values.includes(r[column]));
      return chain;
    },
    order: () => chain,
    limit() { return chain; },
    single: () => {
      const hit = working[0];
      return hit
        ? { then: (r) => r({ data: hit, error: null }) }
        : { then: (r) => r({ data: null, error: { message: "no rows" } }) };
    },
    insert(payload) {
      written.inserted.push(payload);
      return { select: () => chain, single: () => ({ then: (r) => r({ data: payload, error: null }) }) };
    },
    update(payload) {
      working = working.map((r) => Object.assign({}, r, payload));
      return { eq: () => ({ then: (r) => r({ error: null }) }) };
    },
    delete() {
      written.deleted.push(working.map((r) => r.id));
      return { eq: () => ({ then: (r) => r({ error: null }) }) };
    },
    then: (resolve) => resolve({ data: working, error: null, count: working.length }),
  };
  return chain;
}

stub("../src/config/supabase", { supabase: { from: () => catalogTable() } });
stub("../src/config/firebase", {
  db: { collection: () => ({ where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) }) },
});

const controller = require("../src/controllers/catalogController");

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
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
}

async function call(handler, req) {
  const res = mockRes();
  await handler({ params: {}, query: {}, body: {}, ...req }, res);
  return res;
}

const SUPER = { user: { uid: "root" }, profile: { role: "admin", adminLevel: "super", courseId: null } };
const BIT = { user: { uid: "bitAdmin" }, profile: { role: "admin", adminLevel: "course", courseId: "BIT" } };
const CT = { user: { uid: "ctAdmin" }, profile: { role: "admin", adminLevel: "course", courseId: "CT" } };
const STUDENT = { user: { uid: "s1" }, profile: { role: "student", course: "CT" } };

(async () => {
  console.log("--- list and stats are scoped ---");
  check("super sees the whole catalog", (await call(controller.getAll, SUPER)).payload.map((r) => r.id), ["1", "2", "3", "4"]);
  check("BIT admin sees only BIT", (await call(controller.getAll, BIT)).payload.map((r) => r.id), ["1", "2"]);
  check("CT admin sees only CT", (await call(controller.getAll, CT)).payload.map((r) => r.id), ["3"]);
  check("the course-less row is hidden from Course Admins", (await call(controller.getAll, BIT)).payload.map((r) => r.id).includes("4"), false);
  check("a student is unaffected (InventoryPage reads all)", (await call(controller.getAll, STUDENT)).payload.map((r) => r.id), ["1", "2", "3", "4"]);

  const bitStats = await call(controller.getStats, BIT);
  check("BIT stats total", bitStats.payload.total, 2);
  check("BIT stats bucket by course", bitStats.payload.byCourse, [{ course: "BIT", total: 2, available: 1 }]);

  console.log("--- GET /:id is scoped, not just the list ---");
  check("own item is served", (await call(controller.getById, { ...CT, params: { id: "3" } })).statusCode, 200);
  check("another course's item is a 404", (await call(controller.getById, { ...CT, params: { id: "1" } })).statusCode, 404);
  check("the 404 body does not confirm it exists",
    (await call(controller.getById, { ...CT, params: { id: "1" } })).payload.error, "Item not found");
  check("the course-less item is a 404 too", (await call(controller.getById, { ...BIT, params: { id: "4" } })).statusCode, 404);
  check("super can read any item", (await call(controller.getById, { ...SUPER, params: { id: "4" } })).statusCode, 200);

  console.log("--- /options is scoped (it feeds every item picker) ---");
  check("CT admin's picker holds only CT", (await call(controller.getOptions, CT)).payload.map((r) => r.id), ["3"]);
  check("BIT admin's picker holds only BIT", (await call(controller.getOptions, BIT)).payload.map((r) => r.id), ["1", "2"]);
  check("a student's picker is unaffected", (await call(controller.getOptions, STUDENT)).payload.length, 4);

  console.log("--- barcode lookup is scoped ---");
  check("own barcode resolves", (await call(controller.lookupByBarcode, { ...CT, params: { code: "BC-003" } })).statusCode, 200);
  check("another course's barcode is a 404", (await call(controller.lookupByBarcode, { ...CT, params: { code: "BC-001" } })).statusCode, 404);
  check("and via asset_tag", (await call(controller.lookupByBarcode, { ...CT, params: { code: "AT-001" } })).statusCode, 404);
  check("super can scan any barcode", (await call(controller.lookupByBarcode, { ...SUPER, params: { code: "BC-001" } })).statusCode, 200);

  console.log("--- create cannot mint inventory for another course ---");
  {
    written.inserted.length = 0;
    const res = await call(controller.create, {
      ...CT,
      body: { itemName: "WELDER", category: "Tools", course: "MT", quantity: 2, condition: "Good" },
    });
    check("creating a foreign-course item is a 400", res.statusCode, 400);
    check("and nothing was written", written.inserted.length, 0);
  }
  {
    written.inserted.length = 0;
    const res = await call(controller.create, {
      ...CT,
      body: { itemName: "DRILL", category: "Tools", course: "CT", quantity: 2, condition: "Good" },
    });
    check("creating an own-course item succeeds", res.statusCode, 201);
    check("and the row carries that course", written.inserted[0].course, "CT");
  }
  {
    const res = await call(controller.create, {
      ...SUPER,
      body: { itemName: "HYDRAULIC JACK", category: "Tools", course: "AT", quantity: 1, condition: "Good" },
    });
    check("super may create in any course", res.statusCode, 201);
  }

  console.log("--- update and remove cannot reach across courses ---");
  check("editing a foreign item is a 404", (await call(controller.update, {
    ...CT, params: { id: "1" }, body: { quantity: 10 },
  })).statusCode, 404);
  check("deleting a foreign item is a 404", (await call(controller.remove, {
    ...CT, params: { id: "1" },
  })).statusCode, 404);
  check("moving an item to another course is a 400", (await call(controller.update, {
    ...CT, params: { id: "3" }, body: { course: "MT" },
  })).statusCode, 400);
  check("super may edit any item", (await call(controller.update, {
    ...SUPER, params: { id: "1" }, body: { condition: "Fair" },
  })).statusCode, 200);

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("catalogScope: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(2);
});