const { supabase } = require("../config/supabase");
const { parseLocalDay } = require("./exportUtils");
// orEq quotes the value so a course name containing a comma, quote or bracket
// cannot produce a malformed .or() filter (which PostgREST answers as a syntax
// error, i.e. a 500 on the whole Transactions endpoint). See utils/postgrest.js.
const { orEqAny } = require("./postgrest");

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRemainingQuantity(t) {
  const ret = t?.returned_quantity ?? t?.returnedQuantity;
  return Math.max(0, numberOr(t?.quantity, 1) - numberOr(ret));
}

function isOpenBorrow(t) {
  if (t?.action !== "borrowed") return false;
  if ((t?.status || "").toLowerCase() === "returned") return false;
  return getRemainingQuantity(t) > 0;
}

const time = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

/**
 * Return rows inherit borrowed_at/due_date from the parent borrow row, which is
 * only present in some rows depending on how the return was recorded.
 */
async function backfillBorrowDates(items) {
  const missing = items.filter((i) => !i.borrowed_at && i.original_transaction_id);
  if (missing.length === 0) return items;

  const borrowIds = [...new Set(missing.map((i) => i.original_transaction_id))];
  const { data: borrowRecords } = await supabase
    .from("transactions").select("*").in("id", borrowIds);
  const borrowMap = {};
  if (borrowRecords) borrowRecords.forEach((r) => { borrowMap[r.id] = r; });

  return items.map((item) => {
    if (!item.borrowed_at && item.original_transaction_id && borrowMap[item.original_transaction_id]) {
      const borrow = borrowMap[item.original_transaction_id];
      return {
        ...item,
        borrowed_at: borrow.borrowed_at || borrow.timestamp || null,
        due_date: item.due_date || borrow.due_date || null,
      };
    }
    return item;
  });
}

/**
 * Applies the query filters shared by the transactions table and its exports.
 * Keeping this in one place is what guarantees the XLSX matches what is on screen.
 */
function applyTransactionFilters(items, query = {}) {
  let result = items;

  if (query.search) {
    const q = String(query.search).toLowerCase();
    result = result.filter((i) =>
      `${i.first_name || ""} ${i.last_name || ""}`.toLowerCase().includes(q) ||
      (i.school_id || "").toLowerCase().includes(q) ||
      (i.item_name || "").toLowerCase().includes(q) ||
      (i.course || "").toLowerCase().includes(q)
    );
  }

  if (query.course) {
    result = result.filter((i) => i.course === query.course || i.equipment_course === query.course);
  }

  if (query.year) {
    result = result.filter((i) => i.year === query.year);
  }

  if (query.dateFrom) {
    const from = parseLocalDay(query.dateFrom);
    if (from) {
      const fromMs = from.getTime();
      result = result.filter((i) => {
        const d = time(i.timestamp);
        return d !== null && d >= fromMs;
      });
    }
  }

  if (query.dateTo) {
    const to = parseLocalDay(query.dateTo, true);
    if (to) {
      const toMs = to.getTime();
      result = result.filter((i) => {
        const d = time(i.timestamp);
        return d !== null && d <= toMs;
      });
    }
  }

  return result;
}

/** Mirrors sortTransactions() in frontend/src/utils/helpers.js. */
function sortTransactions(items, sortBy) {
  const [key, dir] = String(sortBy || "date-desc").split("-");
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === "date") {
      return ((time(a.timestamp) || 0) - (time(b.timestamp) || 0)) * mult;
    }
    if (key === "name") {
      const na = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
      const nb = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
      return na.localeCompare(nb) * mult;
    }
    if (key === "qty") return ((numberOr(a.quantity) - numberOr(b.quantity))) * mult;
    return 0;
  });
}

/**
 * Loads transactions for `action` with every filter applied, newest first.
 * Shared by the table endpoints and the report exports.
 */
async function queryTransactions(action, query = {}) {
  // Push the indexed, exact-match predicates into SQL.
  //
  // The old shape was `.select("*").eq("action", action)` and nothing else, so
  // every page of the admin Transactions table read the entire action bucket --
  // all 35 columns of every borrow or return ever recorded -- and then filtered,
  // sorted and sliced it in Node. Because no `count` was requested either, a
  // bucket larger than PostgREST's max-rows cap silently produced a short
  // `total`, which is the failure utils/fetchAll.js exists to warn about.
  let q = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("action", action);

  // course matches EITHER column, so it is an OR across two columns rather than a
  // single .eq(). The row volume still drops from the whole bucket to one course.
  //
  // orEqAny rather than string-concatenating two orEq() calls by hand. That is what
  // the helper exists for, and hand-rolling it is exactly how the unquoted variant
  // came to exist in the first place: a course named "IT, Computer Science" contains
  // a comma, which silently rewrites the whole .or() clause into different filters.
  if (query.course) {
    q = q.or(orEqAny(["course", "equipment_course"], query.course));
  }
  if (query.year) {
    q = q.eq("year", query.year);
  }
  // Date bounds on `timestamp`, which is indexed DESC. parseLocalDay is the same
  // calendar-day conversion the JS filter used, so a date with a time component
  // still includes the whole boundary day.
  if (query.dateFrom) {
    const from = parseLocalDay(query.dateFrom);
    if (from) q = q.gte("timestamp", from.toISOString());
  }
  if (query.dateTo) {
    const to = parseLocalDay(query.dateTo, true);
    if (to) q = q.lte("timestamp", to.toISOString());
  }
  // Newest first by default, server-side. The client asked for date-desc by
  // default, which is also the cheapest index order to produce.
  const [sortKey, sortDir] = String(query.sort || "date-desc").split("-");
  const asc = sortDir !== "desc";
  if (sortKey === "date") {
    // nullsFirst must match the JS comparator this replaces.
    //
    // sortTransactions coerces a missing/invalid timestamp to 0 via
    // `(time(a.timestamp) || 0)`, which places such rows LAST in date-desc and FIRST
    // in date-asc. So `nullsFirst` has to equal `ascending`.
    //
    // Postgres defaults to the opposite (NULLS FIRST for DESC, NULLS LAST for ASC),
    // so omitting this inverted the null rows: `?page=1` would show a different set
    // of rows than before whenever any row lacked a timestamp -- and timestamp is
    // nullable in practice, which is why backfillBorrowDates exists at all.
    q = q.order("timestamp", { ascending: asc, nullsFirst: asc });
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // isOpenBorrow is row-local arithmetic (quantity minus returned_quantity) and
  // backfillBorrowDates needs a second query, so both stay in JS. The remaining
  // filters are re-applied below: applyTransactionFilters is idempotent, and
  // leaving the pushed-down ones in place would be harmless duplication rather
  // than a behaviour change.
  let items = action === "borrowed"
    ? (data || []).filter((d) => isOpenBorrow(d))
    : await backfillBorrowDates(data || []);

  items = applyTransactionFilters(items, query);

  // Re-sorting in JS is only necessary for the sorts SQL cannot express here
  // (name, qty). For the default date sort the rows are already ordered, and
  // sortTransactions copies the array before sorting anyway, so skipping it saves
  // one O(n) copy per request.
  if (sortKey !== "date") {
    items = sortTransactions(items, query.sort || "date-desc");
  }

  return items;
}

module.exports = {
  isOpenBorrow,
  getRemainingQuantity,
  applyTransactionFilters,
  sortTransactions,
  queryTransactions,
  backfillBorrowDates,
};
