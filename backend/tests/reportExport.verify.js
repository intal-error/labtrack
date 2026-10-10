process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// Stub the supabase client before the report controller loads so we exercise the
// real ExcelJS generation path without touching the network.
const supabasePath = require.resolve("../src/config/supabase");
const rows = [
  { id: "1", first_name: "Marc", last_name: "Lawrence", school_id: "23-000039", item_name: "KEYBOARD", course: "BIT", year: "3rd Year", equipment_course: "BIT", timestamp: "2026-09-30T04:36:00Z", action: "borrowed", status: "borrowed", quantity: 1, returned_quantity: 0, due_date: "2026-10-05T00:00:00Z" },
  { id: "2", first_name: "Ana", last_name: "Reyes", school_id: "24-000112", item_name: "MOUSE", course: "BIT", year: "2nd Year", equipment_course: "CT", timestamp: "2026-09-28T09:20:00Z", action: "borrowed", status: "borrowed", quantity: 2, returned_quantity: 0, due_date: null },
  { id: "3", first_name: "Jude", last_name: "Santos", school_id: "25-000777", item_name: "MOUSE", course: "CT", year: "1st Year", equipment_course: "CT", timestamp: "2026-09-20T09:20:00Z", action: "returned", status: "returned", quantity: 1, returned_quantity: 0, returned_at: "2026-09-27T08:07:00Z", borrowed_at: "2026-09-20T09:00:00Z" },
];

// Chainable stub that executes its predicates.
//
// It used to be `.eq()` returning a bare Promise -- that only worked while
// queryTransactions ended its SQL at `.eq("action", ...)`. It now continues the
// chain with .or() for course, .eq() for year, .gte()/.lte() for the date range and
// .order(), so a Promise-returning stub would throw on the first extra predicate
// and a filter-ignoring one would let a broken pushdown pass unnoticed.
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: () => {
        let working = [...rows];
        const chain = {
          select: () => chain,
          eq: (k, v) => {
            working = working.filter((r) => String(r[k]) === String(v));
            return chain;
          },
          or: (expr) => {
            // Quoted values (utils/postgrest.js) -- see tests/helpers/orFilter.js.
            working = applyOr(working, expr);
            return chain;
          },
          gte: (k, v) => { working = working.filter((r) => new Date(r[k]) >= new Date(v)); return chain; },
          lte: (k, v) => { working = working.filter((r) => new Date(r[k]) <= new Date(v)); return chain; },
          order: () => chain,
          // backfillBorrowDates looks up parent borrow rows; no fixture needs one.
          in: () => chain,
          then: (resolve) => resolve({ data: working, error: null, count: working.length }),
        };
        return chain;
      },
    },
  },
};

const { applyOr } = require("./helpers/orFilter");

const ExcelJS = require("exceljs");
const { borrowedReport, returnedReport } = require("../src/controllers/reportController");

function makeRes() {
  const chunks = [];
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
    write(chunk) { chunks.push(chunk); return true; },
    end() { this.ended = true; },
    async buffer() { return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))); },
  };
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

(async () => {
  // queryTransactions now REQUIRES the request, because the course scope is the
  // only thing keeping an admin inside their own course on this endpoint. A
  // request without a profile is a programming error, not an unscoped export.
  //
  // Super Admin for the two existing cases: they are explicitly filtering by
  // ?course=, which is exactly what the top tier is for.
  const asSuper = (query) => ({
    query,
    profile: { role: "admin", adminLevel: "super", courseId: null },
  });

  // --- Borrowed export filtered to BIT / 3rd Year ---
  const res1 = makeRes();
  await borrowedReport(asSuper({ course: "BIT", year: "3rd Year", sort: "date-desc" }), res1);

  check("borrowed: filename reflects filters", res1.headers["Content-Disposition"], "attachment; filename=Transactions_Borrowed_BIT_3rd_Year.xlsx");
  check("borrowed: correct content type", res1.headers["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.load(await res1.buffer());
  const s1 = wb1.getWorksheet(1);

  check("borrowed: sheet name", s1.name, "Borrowed Transactions");
  check("borrowed: title", s1.getCell("A1").value, "Borrowed Transactions Report");
  check("borrowed: subtitle describes filters", s1.getCell("A2").value, "Course: BIT | Year: 3rd Year | All Time | Generated: " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
  check("borrowed: header row includes Year + Equipment Course",
    s1.getRow(3).values.slice(1),
    ["Name", "School ID", "Course", "Year", "Equipment Course", "Item", "Quantity", "Borrowed Date", "Due Date", "Status"]);
  check("borrowed: only the BIT/3rd Year row exported", s1.getRow(4).getCell(1).value, "Marc Lawrence");
  check("borrowed: year value present in row", s1.getRow(4).getCell(4).value, "3rd Year");
  check("borrowed: filtered-out BIT/2nd Year row is absent", s1.getRow(5).values.slice(1).filter(Boolean).length, 0);
  check("borrowed: summary row", s1.getRow(6).getCell(2).value, "Total Records: 1");

  // --- Returned export with a custom date range ---
  const res2 = makeRes();
  await returnedReport(asSuper({ course: "CT", dateFrom: "2026-09-01", dateTo: "2026-09-30" }), res2);

  check("returned: filename", res2.headers["Content-Disposition"], "attachment; filename=Transactions_Returned_CT.xlsx");

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(await res2.buffer());
  const s2 = wb2.getWorksheet(1);

  check("returned: sheet name", s2.name, "Returned Transactions");
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  check("returned: subtitle describes custom range", s2.getCell("A2").value, `Course: CT | From: Sep 1, 2026 To: Sep 30, 2026 | Generated: ${today}`);
  check("returned: header row", s2.getRow(3).values.slice(1),
    ["Name", "School ID", "Course", "Year", "Equipment Course", "Item", "Quantity", "Borrowed Date", "Returned Date", "Status"]);
  // Borrowed Date must come from borrowed_at (Sep 20), not the return time (Sep 27).
  const borrowedDate = String(s2.getRow(4).getCell(8).value);
  const returnedDate = String(s2.getRow(4).getCell(9).value);
  check("returned: Borrowed Date uses borrowed_at, not the return time",
    borrowedDate.startsWith("Sep 20, 2026") && !borrowedDate.includes("Sep 27"), true);
  check("returned: Returned Date uses returned_at",
    returnedDate.startsWith("Sep 27, 2026"), true);
  check("returned: summary row", s2.getRow(6).getCell(2).value, "Total Records: 1");

  // --- A Course Admin's export must not carry another course's loans ---
  //
  // This is the worst-case leak in the whole feature: an export is a file the
  // admin walks away with, so a scoping bug here outlives the session and is not
  // visible on any screen afterwards. The Course Admin below is scoped to BIT and
  // asks for NO ?course= filter, so the scope is the only thing keeping them in.
  const namesIn = async (req) => {
    const res = makeRes();
    await borrowedReport(req, res);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.buffer());
    const sheet = wb.getWorksheet(1);

    const names = [];
    let total = null;
    for (let r = 4; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = row.getCell(1).value;
      if (name) names.push(name);
      const second = row.getCell(2).value;
      if (typeof second === "string" && second.startsWith("Total Records:")) total = second;
    }
    return { names, total, status: res.statusCode };
  };

  const bitAdmin = await namesIn({
    query: { sort: "date-desc" },
    profile: { role: "admin", adminLevel: "course", courseId: "BIT" },
  });

  // Marc is a BIT student with BIT equipment. Ana is a BIT student who borrowed
  // CT equipment -- still the BIT admin's business, because `course` matched.
  check("BIT admin: sees both BIT students", bitAdmin.names, ["Marc Lawrence", "Ana Reyes"]);
  check("BIT admin: the CT student's loan is absent", bitAdmin.names.includes("Jude Santos"), false);
  check("BIT admin: summary counts only their rows", bitAdmin.total, "Total Records: 2");

  // The mirror image: that same CT-equipment loan belongs to the CT admin too,
  // because the CT admin's scope matched `equipment_course`. This is why the
  // scope is an OR across both columns and not just the student's course.
  const ctAdmin = await namesIn({
    query: { sort: "date-desc" },
    profile: { role: "admin", adminLevel: "course", courseId: "CT" },
  });
  check("CT admin: sees the CT student's own loan", ctAdmin.names.includes("Jude Santos"), false);
  check("CT admin: sees CT equipment borrowed by a BIT student", ctAdmin.names, ["Ana Reyes"]);
  check("CT admin: does not see the pure-BIT loan", ctAdmin.names.includes("Marc Lawrence"), false);

  // A Course Admin with no course sees nothing at all -- never an error.
  const orphanAdmin = await namesIn({
    query: {},
    profile: { role: "admin", adminLevel: "course", courseId: "ZZZ" },
  });
  check("an admin scoped to an unknown course exports nothing", orphanAdmin.names, []);
  check("and is not a 500", orphanAdmin.status, 200);

  console.log("");
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("EXPORT TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
