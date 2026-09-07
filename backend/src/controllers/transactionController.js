const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

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

function getRemainingQuantity(t) {
  const ret = t?.returned_quantity ?? t?.returnedQuantity;
  return Math.max(0, numberOr(t?.quantity, 1) - numberOr(ret));
}

function isOpenBorrow(t) {
  if (t?.action !== "borrowed") return false;
  if ((t?.status || "").toLowerCase() === "returned") return false;
  return getRemainingQuantity(t) > 0;
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

async function enrichWithProfileURL(items) {
  const userIds = [...new Set(items.map((i) => i.user_id || i.userId).filter(Boolean))];
  if (userIds.length === 0) return items;
  const userSnaps = await Promise.all(userIds.map((id) => db.collection("users").doc(id).get()));
  const profileMap = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) {
      const data = snap.data();
      if (data.profileURL) profileMap[snap.id] = data.profileURL;
    }
  });
  return items.map((item) => ({
    ...item,
    profileURL: item.profileURL || item.profile_url || profileMap[item.user_id || item.userId] || "",
  }));
}

const getBorrowed = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("action", "borrowed");
    if (error) throw new Error(error.message);

    let items = (data || [])
      .filter((d) => isOpenBorrow(d))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter((i) =>
        `${i.first_name || ""} ${i.last_name || ""}`.toLowerCase().includes(q) ||
        (i.school_id || "").toLowerCase().includes(q) ||
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.course || "").toLowerCase().includes(q)
      );
    }
    if (req.query.course) {
      items = items.filter((i) => i.course === req.query.course || i.equipment_course === req.query.course);
    }
    if (req.query.dateFrom) {
      const from = new Date(req.query.dateFrom);
      items = items.filter((i) => { const d = new Date(i.timestamp); return !isNaN(d.getTime()) && d >= from; });
    }
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      items = items.filter((i) => { const d = new Date(i.timestamp); return !isNaN(d.getTime()) && d <= to; });
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

const getReturned = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("action", "returned");
    if (error) throw new Error(error.message);

    let items = (data || [])
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

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
        `${i.first_name || ""} ${i.last_name || ""}`.toLowerCase().includes(q) ||
        (i.school_id || "").toLowerCase().includes(q) ||
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.course || "").toLowerCase().includes(q)
      );
    }
    if (req.query.course) {
      items = items.filter((i) => i.course === req.query.course || i.equipment_course === req.query.course);
    }
    if (req.query.dateFrom) {
      const from = new Date(req.query.dateFrom);
      items = items.filter((i) => { const d = new Date(i.timestamp); return !isNaN(d.getTime()) && d >= from; });
    }
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      items = items.filter((i) => { const d = new Date(i.timestamp); return !isNaN(d.getTime()) && d <= to; });
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

const getMyBorrowed = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("action", "borrowed")
      .eq("user_id", uid);
    if (error) throw new Error(error.message);

    let items = (data || [])
      .filter((d) => isOpenBorrow(d))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

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

    let items = (data || [])
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

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

const getDashboardCounts = async (req, res) => {
  try {
    const [borrowedResult, returnedResult, studentsSnap, usersSnap] = await Promise.all([
      supabase.from("transactions").select("id, action, status, quantity, returned_quantity").eq("action", "borrowed"),
      supabase.from("transactions").select("id").eq("action", "returned"),
      db.collection("users").where("role", "==", "student").get(),
      db.collection("users").get(),
    ]);
    const borrowedItems = borrowedResult.data || [];
    const activeBorrowed = borrowedItems.filter((d) => isOpenBorrow(d)).length;
    const returnedItems = returnedResult.data || [];
    res.json({
      borrowed: activeBorrowed,
      returned: returnedItems.length,
      users: usersSnap.size,
      students: studentsSnap.size,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getChartData = async (req, res) => {
  try {
    const [borrowedResult, returnedResult, availableResult, inventoryResult] = await Promise.all([
      supabase.from("transactions").select("id").eq("action", "borrowed"),
      supabase.from("transactions").select("id").eq("action", "returned"),
      supabase.from("catalog").select("id").eq("available", true),
      supabase.from("catalog").select("id"),
    ]);
    res.json({
      borrowed: (borrowedResult.data || []).length,
      returned: (returnedResult.data || []).length,
      available: (availableResult.data || []).length,
      inventory: (inventoryResult.data || []).length,
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
    const { borrowId, itemId, schoolID, quantity, returnPhotoURL, conditionOnReturn } = req.body;

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", itemId).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    const { data: borrow, error: borrowError } = await supabase
      .from("transactions").select("*").eq("id", borrowId).single();
    if (borrowError || !borrow) throw new Error("Borrow record not found");
    if (!isOpenBorrow(borrow)) throw new Error("Already returned");

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
      }).eq("id", itemId);
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
      catalog_id: itemId,
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

const getRecentActivity = async (req, res) => {
  try {
    const [borrowResult, returnResult] = await Promise.all([
      supabase.from("transactions").select("*").eq("action", "borrowed"),
      supabase.from("transactions").select("*").eq("action", "returned"),
    ]);

    const borrows = (borrowResult.data || []).map((d) => ({
      id: d.id,
      action: "borrowed",
      first_name: d.first_name || "",
      last_name: d.last_name || "",
      item_name: d.item_name || "",
      quantity: numberOr(d.quantity, 1),
      timestamp: d.timestamp || d.borrowed_at || null,
      due_date: d.due_date || null,
      school_id: d.school_id || "",
      course: d.course || "",
      equipment_course: d.equipment_course || "",
      email: d.email || "",
    }));

    const returns = (returnResult.data || []).map((d) => ({
      id: d.id,
      action: "returned",
      first_name: d.first_name || "",
      last_name: d.last_name || "",
      item_name: d.item_name || "",
      quantity: numberOr(d.quantity, 1),
      timestamp: d.timestamp || d.returned_at || null,
      returned_at: d.returned_at || null,
      due_date: d.due_date || null,
      school_id: d.school_id || "",
      course: d.course || "",
      equipment_course: d.equipment_course || "",
      email: d.email || "",
    }));

    const merged = [...borrows, ...returns]
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 10);

    const enriched = await enrichWithProfileURL(merged);
    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const recordMyReturn = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { borrowId, itemId, quantity, returnPhotoURL, conditionOnReturn } = req.body;

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", itemId).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    const { data: borrow, error: borrowError } = await supabase
      .from("transactions").select("*").eq("id", borrowId).single();
    if (borrowError || !borrow) throw new Error("Borrow record not found");
    if (!isOpenBorrow(borrow)) throw new Error("Already returned");
    if (borrow.user_id !== uid) throw new Error("You can only return items you borrowed");

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
      }).eq("id", itemId);
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
      catalog_id: itemId,
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

module.exports = { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn, recordMyReturn, getRecentActivity };
