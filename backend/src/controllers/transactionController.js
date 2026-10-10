const { db, FieldPath } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const { getRemainingQuantity, isOpenBorrow, queryTransactions, sortTransactions } = require("../utils/transactionFilters");
const { scopedAny, assertCourseInScope } = require("../middleware/courseScope");

// Firestore's hard limit on `in` queries.
const FIRESTORE_IN_CHUNK = 30;
const PROFILE_URL_TTL_MS = 5 * 60 * 1000;
const profileUrlCache = new Map();
let profileUrlSweptAt = 0;

/**
 * Drop a memoised avatar.
 *
 * Mounted as middleware on PUT /api/auth/profile (see routes/auth.js), which is why
 * it takes (req, res, next) despite doing no I/O: the caller's uid is the cache key.
 */
function invalidateProfileUrl(req, _res, next) {
  profileUrlCache.delete(req.user?.uid);
  next();
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAvailableQuantity(item) {
  const avail = item?.available_quantity ?? item?.availableQuantity;
  if (Number.isFinite(Number(avail))) {
    return Math.max(0, numberOr(avail));
  }
  const quantity = Math.max(0, numberOr(item?.quantity));
  return (item?.status || "").toLowerCase() === "borrowed" ? 0 : quantity;
}

async function createFineForLateReturn(borrowData, transactionId) {
  try {
    const dueDate = new Date(borrowData.due_date || borrowData.dueDate);
    if (isNaN(dueDate.getTime())) return;

    const now = new Date();
    if (now <= dueDate) return;

    const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
    if (daysOverdue < 1) return;

    const { data: existing } = await supabase
      .from("fines").select("id")
      .eq("transaction_id", transactionId)
      .eq("status", "pending");
    if (existing && existing.length > 0) return;

    const { data: settings } = await supabase
      .from("settings").select("*").eq("id", "appSettings").single();
    const finePerDay = Number(settings?.fine_per_day) || 5;
    const totalFine = daysOverdue * finePerDay;

    const userId = borrowData.user_id || borrowData.userId || "";
    const itemName = borrowData.item_name || borrowData.itemName || "Unknown Item";

    await supabase.from("fines").insert({
      id: randomUUID(),
      user_id: userId,
      transaction_id: transactionId,
      item_name: itemName,
      days_overdue: daysOverdue,
      fine_per_day: finePerDay,
      total_fine: totalFine,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (userId) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: userId,
        type: "warning",
        title: "Fine Issued",
        message: `A fine of ₱${totalFine} has been issued for "${itemName}" (${daysOverdue} days overdue). Please settle the fine.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    console.log(`Late return fine created for ${transactionId}: ₱${totalFine} (${daysOverdue} days overdue)`);
  } catch (err) {
    console.error(`Failed to create late return fine:`, err.message);
  }
}

// Batched, memoised, and capped.
//
// WHY: this ran once per unique student per request, so a 25-row page from 25
// different students opened 25 parallel Firestore gRPC streams -- on every page
// change, every sort and every search keystroke. The calls are parallel so latency
// was one round trip, but the connection and quota cost scaled with the page size.
//
// Firestore caps an `in` query at 30 values, hence the chunking. The memo means a
// student's avatar is read once per process rather than once per page view --
// profile URLs change rarely, and this endpoint is polled.
//
// Callers pass the PAGE, never the full result set: getBorrowed/getReturned slice
// before enriching, so the N here is the page size and not the table size.
async function enrichWithProfileURL(items) {
  const userIds = [...new Set(items.map((i) => i.user_id || i.userId).filter(Boolean))];
  if (userIds.length === 0) return items;

  // Age-based sweep, not per-entry TTL checks: this map is bounded by the number of
  // students who have ever appeared on a page of transactions, and dropping the
  // whole cache once its oldest entry is past the TTL keeps eviction O(1) amortised
  // instead of scanning on every read.
  if (Date.now() - profileUrlSweptAt > PROFILE_URL_TTL_MS) {
    profileUrlSweptAt = Date.now();
    profileUrlCache.clear();
  }

  const uncached = userIds.filter((id) => !profileUrlCache.has(id));
  for (let i = 0; i < uncached.length; i += FIRESTORE_IN_CHUNK) {
    const chunk = uncached.slice(i, i + FIRESTORE_IN_CHUNK);
    const snap = await db
      .collection("users")
      .where(FieldPath.documentId(), "in", chunk)
      .get();
    for (const doc of snap.docs) {
      profileUrlCache.set(doc.id, doc.data().profileURL || "");
    }
    // Ids with no document (deleted users) must be recorded too, or every request
    // re-queries them forever.
    for (const id of chunk) {
      if (!profileUrlCache.has(id)) profileUrlCache.set(id, "");
    }
  }

  return items.map((item) => ({
    ...item,
    profileURL: item.profileURL || item.profile_url || profileUrlCache.get(item.user_id || item.userId) || "",
  }));
}

const getBorrowed = async (req, res) => {
  try {
    let items = await queryTransactions("borrowed", req.query, req);

    const { page, limit, paginate } = parsePagination(req);
    const total = items.length;

    if (paginate) {
      const paged = items.slice((page - 1) * limit, page * limit);
      const enriched = await enrichWithProfileURL(paged);
      return res.json(paginatedResponse(transformKeys(enriched), total, page, limit));
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getReturned = async (req, res) => {
  try {
    let items = await queryTransactions("returned", req.query, req);

    const { page, limit, paginate } = parsePagination(req);
    const total = items.length;

    if (paginate) {
      const paged = items.slice((page - 1) * limit, page * limit);
      const enriched = await enrichWithProfileURL(paged);
      return res.json(paginatedResponse(transformKeys(enriched), total, page, limit));
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyBorrowed = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("action", "borrowed")
      .eq("user_id", uid);
    if (error) throw new Error(error.message);

    // sortTransactions (not a hardcoded comparator) so ?sort= is honoured here
    // exactly as it already is on the admin endpoints via queryTransactions.
    // Without it the "Name A-Z" / "Qty" options could only ever reorder the one
    // page the client had fetched.
    let items = sortTransactions(
      (data || []).filter((d) => isOpenBorrow(d)),
      req.query.sort || "date-desc"
    );

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter((i) =>
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.course || "").toLowerCase().includes(q)
      );
    }

    const { page, limit, paginate } = parsePagination(req);
    const total = items.length;

    if (paginate) {
      const paged = items.slice((page - 1) * limit, page * limit);
      const enriched = await enrichWithProfileURL(paged);
      return res.json(paginatedResponse(transformKeys(enriched), total, page, limit));
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyReturned = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("action", "returned")
      .eq("user_id", uid);
    if (error) throw new Error(error.message);

    // See getMyBorrowed: honour ?sort= through the shared helper instead of a
    // fixed newest-first comparator.
    let items = sortTransactions(data || [], req.query.sort || "date-desc");

    const missingDates = items.filter((i) => !i.borrowed_at && i.original_transaction_id);
    if (missingDates.length > 0) {
      const borrowIds = [...new Set(missingDates.map((i) => i.original_transaction_id))];
      const { data: borrowRecords } = await supabase
        .from("transactions").select("*").in("id", borrowIds);
      const borrowMap = {};
      if (borrowRecords) borrowRecords.forEach((r) => { borrowMap[r.id] = r; });
      items = items.map((item) => {
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

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter((i) =>
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.course || "").toLowerCase().includes(q)
      );
    }

    const { page, limit, paginate } = parsePagination(req);
    const total = items.length;

    if (paginate) {
      const paged = items.slice((page - 1) * limit, page * limit);
      const enriched = await enrichWithProfileURL(paged);
      return res.json(paginatedResponse(transformKeys(enriched), total, page, limit));
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

function categorizeOpenBorrows(open) {
  const now = Date.now();
  let dueSoon = 0;
  let overdue = 0;
  for (const t of open) {
    const due = new Date(t.due_date);
    if (isNaN(due.getTime())) continue;
    const daysLeft = Math.ceil((due.getTime() - now) / DAY_MS);
    if (daysLeft < 0) overdue += 1;
    else if (daysLeft <= 3) dueSoon += 1;
  }
  return { dueSoon, overdue };
}

const getMyStats = async (req, res) => {
  try {
    const uid = req.user.uid;
    const [{ data: borrowedRows, error: borrowedError }, { data: returnedRows, error: returnedError }] =
      await Promise.all([
        supabase.from("transactions").select("*").eq("action", "borrowed").eq("user_id", uid),
        supabase.from("transactions").select("*").eq("action", "returned").eq("user_id", uid),
      ]);
    if (borrowedError) throw new Error(borrowedError.message);
    if (returnedError) throw new Error(returnedError.message);

    const borrowed = borrowedRows || [];
    const open = borrowed.filter(isOpenBorrow);
    const { dueSoon, overdue } = categorizeOpenBorrows(open);

    res.json({
      totalBorrowed: borrowed.length,
      activeBorrows: open.length,
      totalReturned: (returnedRows || []).length,
      dueSoon,
      overdue,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getStats = async (req, res) => {
  try {
    // Scoped, and matching the OR-across-both-course-columns rule the table and
    // export endpoints use. This returned school-wide totals to any admin, so a
    // Course Admin's KPI tiles were counting every other course's loans.
    const COURSE_COLUMNS = ["course", "equipment_course"];
    const [{ data: borrowedRows, error: borrowedError }, { data: returnedRows, error: returnedError }] =
      await Promise.all([
        scopedAny(
          supabase.from("transactions").select("*").eq("action", "borrowed"),
          COURSE_COLUMNS,
          req
        ),
        scopedAny(
          supabase.from("transactions").select("*").eq("action", "returned"),
          COURSE_COLUMNS,
          req
        ),
      ]);
    if (borrowedError) throw new Error(borrowedError.message);
    if (returnedError) throw new Error(returnedError.message);

    const borrowed = borrowedRows || [];
    const weekAgo = Date.now() - 7 * DAY_MS;
    const thisWeek = borrowed.filter((t) => {
      const d = new Date(t.timestamp);
      return !isNaN(d.getTime()) && d.getTime() >= weekAgo;
    }).length;

    res.json({
      totalBorrowed: borrowed.length,
      active: borrowed.filter(isOpenBorrow).length,
      totalReturned: (returnedRows || []).length,
      thisWeek,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const recordBorrow = async (req, res) => {
  try {
    const { itemId, borrower, quantity, dueDate, borrowPhotoURL, conditionOnBorrow } = req.body;

    let userId = borrower.userId || null;
    let resolvedUser = null;
    if (!userId && borrower.schoolID) {
      let userSnap = await db.collection("users")
        .where("schoolId", "==", borrower.schoolID).limit(1).get();
      if (userSnap.empty) {
        userSnap = await db.collection("users")
          .where("employeeId", "==", borrower.schoolID).limit(1).get();
      }
      if (!userSnap.empty) {
        resolvedUser = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        userId = userSnap.docs[0].id;
      }
    }

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", itemId).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    // The catalog item is looked up by id alone, so without this a Course Admin
    // could hand out ANOTHER course's equipment just by passing its id -- neither
    // the loan nor the stock decrement it performs would be refused. 404 rather
    // than 403, so the item's existence is not confirmed to someone outside the
    // course that owns it.
    if (!assertCourseInScope(req, catalogItem.course)) {
      return res.status(404).json({ error: "Catalog item not found" });
    }

    const available = getAvailableQuantity(catalogItem);
    if (available < quantity) throw new Error(`Only ${available} available`);

    let userCourse = borrower.course || "";
    let userYear = borrower.year || "";
    if (!userCourse || !userYear) {
      let userData = resolvedUser;
      if (!userData && userId) {
        const userSnap = await db.collection("users").doc(userId).get();
        if (userSnap.exists) userData = userSnap.data();
      }
      if (userData) {
        if (!userCourse) userCourse = userData.course || "";
        if (!userYear) userYear = userData.year || "";
      }
    }

    const nextAvailable = available - quantity;
    const totalQty = Math.max(numberOr(catalogItem.quantity), nextAvailable);
    const { error: updateCatalogError } = await supabase
      .from("catalog").update({
        available_quantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable < totalQty ? "Borrowed" : "Available",
        updated_at: new Date().toISOString(),
      }).eq("id", itemId);
    if (updateCatalogError) throw new Error(updateCatalogError.message);

    const finalUserId = userId || randomUUID();

    const loanData = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      action: "borrowed",
      status: "borrowed",
      catalog_id: itemId,
      item_name: catalogItem.item_name,
      scan_code: `SLSU-TOOL:${itemId}`,
      quantity: Number(quantity),
      returned_quantity: 0,
      quantity_remaining: Number(quantity),
      school_id: borrower.schoolID,
      first_name: borrower.firstName,
      last_name: borrower.lastName,
      course: userCourse,
      year: userYear,
      user_id: finalUserId,
      due_date: new Date(dueDate).toISOString(),
      timestamp: new Date().toISOString(),
      borrowed_at: new Date().toISOString(),
      equipment_course: catalogItem.course || "",
      assigned_admin_id: borrower.assigned_admin_id || "",
      approved_by: borrower.approvedBy || "",
    };
    if (borrower.email) loanData.email = borrower.email;
    if (borrower.profileURL) loanData.profile_url = borrower.profileURL;
    if (borrowPhotoURL) loanData.borrow_photo_url = borrowPhotoURL;
    if (conditionOnBorrow) loanData.condition_on_borrow = conditionOnBorrow;

    const { error: insertError } = await supabase.from("transactions").insert(loanData);
    if (insertError) throw new Error(insertError.message);

    res.status(201).json({ message: "Borrow recorded" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const recordReturn = async (req, res) => {
  try {
    const { borrowId, itemId, quantity, returnPhotoURL, conditionOnReturn } = req.body;

    const { data: borrow, error: borrowError } = await supabase
      .from("transactions").select("*").eq("id", borrowId).single();
    if (borrowError || !borrow) throw new Error("Borrow record not found");
    if (!isOpenBorrow(borrow)) throw new Error("Already returned");

    // Closing a loan is a write to both the borrow row and the catalog stock, so
    // the same cross-course hole as recordBorrow applies: a Course Admin could
    // settle another course's loan and increment their inventory by doing it.
    // The borrow carries `course` (whose student) and `equipment_course` (whose
    // kit); either makes it the admin's responsibility.
    if (!assertCourseInScope(req, borrow.course) && !assertCourseInScope(req, borrow.equipment_course)) {
      return res.status(404).json({ error: "Borrow record not found" });
    }

    /*
     * The borrow row decides WHICH catalog item this return touches.
     *
     * `itemId` from the body was previously used to fetch and update the catalog
     * row. Since the loan itself is already course-checked above, a Course Admin
     * could settle their own in-scope loan while passing another course's itemId,
     * incrementing that course's stock. recordBorrow already refuses a foreign
     * catalog item (:396); this is the same hole on the way back.
     *
     * A mismatch is refused rather than corrected: it means the stored loan and the
     * request already disagree, and silently picking either would hide that.
     */
    if (!borrow.catalog_id) {
      return res.status(409).json({
        error: "This loan has no recorded catalog item, so it cannot be returned automatically. Please record it manually.",
      });
    }
    if (itemId && String(itemId) !== String(borrow.catalog_id)) {
      return res.status(400).json({ error: "The item does not match the item this loan was recorded for" });
    }
    const authoritativeItemId = borrow.catalog_id;

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", authoritativeItemId).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    const remaining = getRemainingQuantity(borrow);
    if (quantity > remaining) throw new Error(`Only ${remaining} remain`);

    const returned = numberOr(borrow.returned_quantity) + quantity;
    const remainingQty = Math.max(0, numberOr(borrow.quantity, 1) - returned);
    const fullReturn = remainingQty === 0;
    const currentAvail = getAvailableQuantity(catalogItem);
    const totalQty = Math.max(numberOr(catalogItem.quantity), currentAvail + quantity);
    const nextAvailable = Math.min(totalQty, currentAvail + quantity);

    const { error: updateCatalogError } = await supabase
      .from("catalog").update({
        available_quantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable < totalQty ? "Borrowed" : "Available",
        updated_at: new Date().toISOString(),
      }).eq("id", authoritativeItemId);
    if (updateCatalogError) throw new Error(updateCatalogError.message);

    const { error: updateBorrowError } = await supabase
      .from("transactions").update({
        returned_quantity: returned,
        quantity_remaining: remainingQty,
        status: fullReturn ? "returned" : "partially_returned",
        last_returned_at: new Date().toISOString(),
        ...(fullReturn ? { returned_at: new Date().toISOString() } : {}),
      }).eq("id", borrowId);
    if (updateBorrowError) throw new Error(updateBorrowError.message);

    const returnData = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      action: "returned",
      status: "returned",
      original_transaction_id: borrowId,
      catalog_id: authoritativeItemId,
      item_name: borrow.item_name,
      quantity: Number(quantity),
      school_id: borrow.school_id,
      first_name: borrow.first_name || "",
      last_name: borrow.last_name || "",
      course: borrow.course || "",
      year: borrow.year || "",
      user_id: borrow.user_id || null,
      timestamp: new Date().toISOString(),
      returned_at: new Date().toISOString(),
      equipment_course: borrow.equipment_course || "",
      assigned_admin_id: borrow.assigned_admin_id || "",
      returned_to: req.user.uid,
    };
    if (borrow.email) returnData.email = borrow.email;
    if (borrow.due_date) returnData.due_date = borrow.due_date;
    if (borrow.borrowed_at) returnData.borrowed_at = borrow.borrowed_at;
    if (borrow.timestamp) returnData.borrowed_at = borrow.borrowed_at || borrow.timestamp;
    if (returnPhotoURL) returnData.return_photo_url = returnPhotoURL;
    if (conditionOnReturn) returnData.condition_on_return = conditionOnReturn;
    if (borrow.borrow_photo_url) returnData.borrow_photo_url = borrow.borrow_photo_url;
    if (borrow.condition_on_borrow) returnData.condition_on_borrow = borrow.condition_on_borrow;

    const { error: insertReturnError } = await supabase.from("transactions").insert(returnData);
    if (insertReturnError) throw new Error(insertReturnError.message);

    createFineForLateReturn(borrow, borrowId);

    res.status(201).json({ message: "Return recorded" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const recordMyReturn = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { borrowId, itemId, quantity, returnPhotoURL, conditionOnReturn } = req.body;

    const { data: borrow, error: borrowError } = await supabase
      .from("transactions").select("*").eq("id", borrowId).single();
    if (borrowError || !borrow) throw new Error("Borrow record not found");
    if (!isOpenBorrow(borrow)) throw new Error("Already returned");
    if (borrow.user_id !== uid) throw new Error("You can only return items you borrowed");

    /*
     * WHY THIS CHECK, AND WHY IT IS FAIL-CLOSED.
     *
     * `itemId` arrives in the request body, so it is attacker-controlled. It used to
     * be used directly to fetch the catalog row (:565-567) and to increment
     * available_quantity (:585-591), while `borrowId` was checked for ownership a few
     * lines later. That combination meant a student could return their OWN legitimate
     * loan -- which the ownership check does allow -- while passing some OTHER
     * course's itemId, inflating that course's stock and marking it returned against
     * the wrong row. No admin privilege was needed, only a student's own session.
     *
     * The borrow row records which catalog item it was written for, so the only
     * correct itemId is the one the server already stored. Rather than compare the
     * two and then trust the body, the body value is dropped and the stored one used
     * for every subsequent read and write. A mismatch is refused outright rather
     * than repaired, because a mismatch means the two records already disagree and
     * silently preferring either one hides that.
     *
     * Fail-closed on a missing catalog_id: older rows may predate the column, and
     * guessing which item was meant is exactly the class of bug being fixed.
     */
    if (!borrow.catalog_id) {
      return res.status(409).json({
        error: "This loan has no recorded catalog item, so it cannot be returned automatically. Please see the lab staff.",
      });
    }
    if (itemId && String(itemId) !== String(borrow.catalog_id)) {
      return res.status(400).json({
        error: "The item does not match the item this loan was recorded for",
      });
    }
    const authoritativeItemId = borrow.catalog_id;

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", authoritativeItemId).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    const remaining = getRemainingQuantity(borrow);
    if (quantity > remaining) throw new Error(`Only ${remaining} remain`);

    const returned = numberOr(borrow.returned_quantity) + quantity;
    const remainingQty = Math.max(0, numberOr(borrow.quantity, 1) - returned);
    const fullReturn = remainingQty === 0;
    const currentAvail = getAvailableQuantity(catalogItem);
    const totalQty = Math.max(numberOr(catalogItem.quantity), currentAvail + quantity);
    const nextAvailable = Math.min(totalQty, currentAvail + quantity);

    const { error: updateCatalogError } = await supabase
      .from("catalog").update({
        available_quantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable < totalQty ? "Borrowed" : "Available",
        updated_at: new Date().toISOString(),
      }).eq("id", authoritativeItemId);
    if (updateCatalogError) throw new Error(updateCatalogError.message);

    const { error: updateBorrowError } = await supabase
      .from("transactions").update({
        returned_quantity: returned,
        quantity_remaining: remainingQty,
        status: fullReturn ? "returned" : "partially_returned",
        last_returned_at: new Date().toISOString(),
        ...(fullReturn ? { returned_at: new Date().toISOString() } : {}),
      }).eq("id", borrowId);
    if (updateBorrowError) throw new Error(updateBorrowError.message);

    const returnData = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      action: "returned",
      status: "returned",
      original_transaction_id: borrowId,
      catalog_id: authoritativeItemId,
      item_name: borrow.item_name,
      quantity: Number(quantity),
      school_id: borrow.school_id,
      first_name: borrow.first_name || "",
      last_name: borrow.last_name || "",
      course: borrow.course || "",
      year: borrow.year || "",
      user_id: uid,
      timestamp: new Date().toISOString(),
      returned_at: new Date().toISOString(),
      equipment_course: borrow.equipment_course || "",
      assigned_admin_id: borrow.assigned_admin_id || "",
      returned_to: uid,
    };
    if (borrow.email) returnData.email = borrow.email;
    if (borrow.due_date) returnData.due_date = borrow.due_date;
    if (borrow.borrowed_at) returnData.borrowed_at = borrow.borrowed_at;
    if (borrow.timestamp) returnData.borrowed_at = borrow.borrowed_at || borrow.timestamp;
    if (returnPhotoURL) returnData.return_photo_url = returnPhotoURL;
    if (conditionOnReturn) returnData.condition_on_return = conditionOnReturn;
    if (borrow.borrow_photo_url) returnData.borrow_photo_url = borrow.borrow_photo_url;
    if (borrow.condition_on_borrow) returnData.condition_on_borrow = borrow.condition_on_borrow;

    const { error: insertReturnError } = await supabase.from("transactions").insert(returnData);
    if (insertReturnError) throw new Error(insertReturnError.message);

    createFineForLateReturn(borrow, borrowId);

    res.status(201).json({ message: "Return recorded" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = {
  getBorrowed, getReturned, getMyBorrowed, getMyReturned,
  getStats, getMyStats, recordBorrow, recordReturn, recordMyReturn,
  invalidateProfileUrl,
};
