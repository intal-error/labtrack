const { supabase } = require("../config/supabase");
const { parseLocalDay } = require("./exportUtils");

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
  const { data, error } = await supabase
    .from("transactions").select("*")
    .eq("action", action);
  if (error) throw new Error(error.message);

  let items = action === "borrowed"
    ? (data || []).filter((d) => isOpenBorrow(d))
    : await backfillBorrowDates(data || []);

  items = applyTransactionFilters(items, query);
  items = sortTransactions(items, query.sort || "date-desc");
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
