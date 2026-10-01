process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const { applyTransactionFilters, sortTransactions, isOpenBorrow } = require("../src/utils/transactionFilters");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const rows = [
  { id: "1", first_name: "Marc", last_name: "Lawrence", school_id: "23-000039", item_name: "KEYBOARD", course: "BIT", year: "3rd Year", equipment_course: "BIT", timestamp: "2026-09-30T04:36:00Z", action: "borrowed", status: "borrowed", quantity: 1, returned_quantity: 0 },
  { id: "2", first_name: "Ana", last_name: "Reyes", school_id: "24-000112", item_name: "MOUSE", course: "CT", year: "2nd Year", equipment_course: "CT", timestamp: "2026-09-28T09:20:00Z", action: "borrowed", status: "borrowed", quantity: 2, returned_quantity: 0 },
  { id: "3", first_name: "Marc", last_name: "Lawrence", school_id: "23-000039", item_name: "MOUSE", course: "BIT", year: "3rd Year", equipment_course: "CT", timestamp: "2026-09-27T08:07:00Z", action: "returned", status: "returned", quantity: 1, returned_quantity: 0, returned_at: "2026-09-27T08:07:00Z", borrowed_at: "2026-09-20T08:00:00Z" },
  { id: "4", first_name: "Jude", last_name: "Santos", school_id: "25-000777", item_name: "KEYBOARD", course: "BIT", year: "1st Year", equipment_course: "BIT", timestamp: "2026-08-15T10:00:00Z", action: "borrowed", status: "returned", quantity: 1, returned_quantity: 1 },
  { id: "5", first_name: "Kim", last_name: "Diaz", school_id: "26-000555", item_name: "SCANNER", course: "MT", year: "4th Year", equipment_course: "MT", timestamp: "2026-07-01T11:00:00Z", action: "borrowed", status: "borrowed", quantity: 3, returned_quantity: 0 },
];

console.log("--- applyTransactionFilters ---");

check("no filters returns all rows",
  applyTransactionFilters(rows, {}).map((r) => r.id),
  ["1", "2", "3", "4", "5"]);

check("course filter matches borrower course",
  applyTransactionFilters(rows, { course: "BIT" }).map((r) => r.id),
  ["1", "3", "4"]);

check("course filter ALSO matches equipment_course (row 3 is BIT borrower on CT gear)",
  applyTransactionFilters(rows, { course: "CT" }).map((r) => r.id),
  ["2", "3"]);

check("year filter",
  applyTransactionFilters(rows, { year: "3rd Year" }).map((r) => r.id),
  ["1", "3"]);

check("course + year combined",
  applyTransactionFilters(rows, { course: "BIT", year: "1st Year" }).map((r) => r.id),
  ["4"]);

check("search by name (case-insensitive)",
  applyTransactionFilters(rows, { search: "marc" }).map((r) => r.id),
  ["1", "3"]);

check("search by school id",
  applyTransactionFilters(rows, { search: "26-000555" }).map((r) => r.id),
  ["5"]);

check("search by item name",
  applyTransactionFilters(rows, { search: "keyboard" }).map((r) => r.id),
  ["1", "4"]);

check("dateFrom excludes older rows",
  applyTransactionFilters(rows, { dateFrom: "2026-09-01T00:00:00Z" }).map((r) => r.id),
  ["1", "2", "3"]);

check("bare date 'dateTo' is inclusive of the whole end day",
  applyTransactionFilters(rows, { dateFrom: "2026-09-28", dateTo: "2026-09-28" }).map((r) => r.id),
  ["2"]);

check("dateTo with an explicit time is respected exactly",
  applyTransactionFilters(rows, { dateFrom: "2026-09-28T00:00:00Z", dateTo: "2026-09-28T09:00:00Z" }).map((r) => r.id),
  []);

check("custom range from..to is a local calendar window",
  applyTransactionFilters(rows, { dateFrom: "2026-07-01", dateTo: "2026-09-27" }).map((r) => r.id),
  ["3", "4", "5"]);

check("date-only 'from' includes an event earlier that same local day",
  applyTransactionFilters(rows, { dateFrom: "2026-09-30", dateTo: "2026-09-30" }).map((r) => r.id),
  ["1"]);

check("full ISO instants still work as instants",
  applyTransactionFilters(rows, { dateFrom: "2026-09-28T00:00:00Z", dateTo: "2026-09-28T23:59:59Z" }).map((r) => r.id),
  ["2"]);

console.log("--- sortTransactions ---");

check("default date-desc (newest first)",
  sortTransactions(rows).map((r) => r.id),
  ["1", "2", "3", "4", "5"]);

check("date-asc (oldest first)",
  sortTransactions(rows, "date-asc").map((r) => r.id),
  ["5", "4", "3", "2", "1"]);

check("name-asc (Marc Lawrence tie keeps original order)",
  sortTransactions(rows, "name-asc").map((r) => r.id),
  ["2", "4", "5", "1", "3"]);

check("qty-desc",
  sortTransactions(rows, "qty-desc").map((r) => r.id),
  ["5", "2", "1", "3", "4"]);

console.log("--- isOpenBorrow (Borrowed tab excludes closed loans) ---");

check("row 4 is excluded (fully returned)", isOpenBorrow(rows[3]), false);
check("row 1 is open", isOpenBorrow(rows[0]), true);
check("returned action row is excluded", isOpenBorrow(rows[2]), false);

console.log("");
if (failures > 0) {
  console.log(`${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("ALL TESTS PASSED");
