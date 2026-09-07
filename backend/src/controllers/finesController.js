const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

function formatDate(date) {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function enrichFines(fines) {
  if (fines.length === 0) return [];

  const userIds = [...new Set(fines.map((f) => f.user_id).filter(Boolean))];
  const txIds = [...new Set(fines.map((f) => f.transaction_id).filter(Boolean))];

  const [userSnaps, txResult] = await Promise.all([
    Promise.all(userIds.map((id) => db.collection("users").doc(id).get())),
    txIds.length > 0
      ? supabase.from("transactions").select("*").in("id", txIds)
      : { data: [], error: null },
  ]);

  const userMap = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) {
      const d = snap.data();
      userMap[snap.id] = {
        userName: `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || snap.id,
        schoolId: d.schoolId || d.schoolID || "",
        course: d.course || "",
        userRole: d.role || "",
      };
    }
  });

  const txMap = {};
  (txResult.data || []).forEach((tx) => {
    txMap[tx.id] = {
      dueDate: tx.due_date || null,
      borrowedAt: tx.borrowed_at || tx.timestamp || null,
      returnedAt: tx.returned_at || null,
      transactionStatus: tx.status || "",
      itemId: tx.catalog_id || "",
      course: tx.course || "",
      schoolId: tx.school_id || "",
      borrowerName: `${tx.first_name || ""} ${tx.last_name || ""}`.trim() || "",
    };
  });

  return fines.map((f) => {
    const user = userMap[f.user_id] || {};
    const tx = txMap[f.transaction_id] || {};
    return {
      ...f,
      userName: user.userName || tx.borrowerName || f.user_id || "Unknown",
      schoolId: user.schoolId || tx.schoolId || "",
      course: user.course || tx.course || "",
      userRole: user.userRole || "",
      dueDate: tx.dueDate || null,
      borrowedAt: tx.borrowedAt || null,
      returnedAt: tx.returnedAt || null,
      transactionStatus: tx.transactionStatus || "",
      itemId: tx.itemId || "",
    };
  });
}

const getAllFines = async (req, res) => {
  try {
    const { data: fines, error } = await supabase
      .from("fines")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    let enriched = await enrichFines(fines || []);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      enriched = enriched.filter(
        (f) =>
          (f.userName && f.userName.toLowerCase().includes(q)) ||
          (f.item_name && f.item_name.toLowerCase().includes(q)) ||
          (f.schoolId && f.schoolId.toLowerCase().includes(q)) ||
          (f.transaction_id && f.transaction_id.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      enriched = enriched.filter((f) => f.status === req.query.status);
    }

    if (req.query.course && req.query.course !== "All") {
      enriched = enriched.filter((f) => f.course === req.query.course);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(transformKeys(enriched), enriched.length, page, limit));
    }

    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyFines = async (req, res) => {
  try {
    const uid = req.user.uid;

    const { data: fines, error } = await supabase
      .from("fines")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let enriched = await enrichFines(fines || []);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      enriched = enriched.filter(
        (f) =>
          (f.item_name && f.item_name.toLowerCase().includes(q)) ||
          (f.transaction_id && f.transaction_id.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      enriched = enriched.filter((f) => f.status === req.query.status);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(transformKeys(enriched), enriched.length, page, limit));
    }

    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const checkRestriction = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: pendingFines, error: finesError } = await supabase
      .from("fines")
      .select("total_fine")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (finesError) throw finesError;

    let totalPending = 0;
    (pendingFines || []).forEach((fine) => {
      totalPending += Number(fine.total_fine) || 0;
    });

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("fine_restriction_threshold")
      .eq("id", "appSettings")
      .single();

    if (settingsError && settingsError.code !== "PGRST116") throw settingsError;
    const threshold = Number(settings?.fine_restriction_threshold) || 50;

    res.json({
      isRestricted: totalPending >= threshold,
      totalPending,
      threshold,
      pendingCount: (pendingFines || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getOverdueCount = async (req, res) => {
  try {
    const { data: borrowedTx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("action", "borrowed");

    if (error) throw error;

    const now = new Date();
    const overdueUserIds = new Set();

    (borrowedTx || []).forEach((tx) => {
      if (tx.status === "returned") return;
      const dueDate = tx.due_date ? new Date(tx.due_date) : null;
      if (dueDate && now > dueDate && tx.user_id) {
        overdueUserIds.add(tx.user_id);
      }
    });

    res.json({ overdueBorrowers: overdueUserIds.size });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const payFine = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: fine, error: fetchError } = await supabase
      .from("fines")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !fine) return res.status(404).json({ error: "Fine not found" });
    if (fine.status === "paid") return res.status(400).json({ error: "Fine already paid" });

    const { error } = await supabase
      .from("fines")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: req.user.uid,
      })
      .eq("id", id);

    if (error) throw error;

    if (fine.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: fine.user_id,
        type: "success",
        title: "Fine Settled",
        message: `Your \u20b1${fine.total_fine} fine for "${fine.item_name}" has been marked as paid.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    res.json({ message: "Fine marked as paid" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const waiveFine = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Waiver reason is required" });
    }

    const { data: fine, error: fetchError } = await supabase
      .from("fines")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !fine) return res.status(404).json({ error: "Fine not found" });

    const { error } = await supabase
      .from("fines")
      .update({
        status: "waived",
        waived_by: req.user.uid,
        waive_reason: reason.trim(),
        waived_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    if (fine.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: fine.user_id,
        type: "info",
        title: "Fine Waived",
        message: `Your fine for "${fine.item_name}" (\u20b1${fine.total_fine}) has been waived by the laboratory administrator.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    res.json({ message: "Fine waived" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createFineForOverdue = async (transactionId) => {
  try {
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) return;
    if (tx.action !== "borrowed") return;
    if (tx.status === "returned") return;

    const { data: existing } = await supabase
      .from("fines")
      .select("id")
      .eq("transaction_id", transactionId)
      .eq("status", "pending");

    if (existing && existing.length > 0) return;

    const dueDate = tx.due_date ? new Date(tx.due_date) : null;
    if (!dueDate) return;

    const now = new Date();
    if (now <= dueDate) return;

    const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
    if (daysOverdue < 1) return;

    const { data: settings } = await supabase
      .from("settings")
      .select("fine_per_day")
      .single();

    const finePerDay = Number(settings?.fine_per_day) || 5;
    const totalFine = daysOverdue * finePerDay;

    await supabase.from("fines").insert({
      id: randomUUID(),
      user_id: tx.user_id || "",
      transaction_id: transactionId,
      item_name: tx.item_name || "Unknown Item",
      days_overdue: daysOverdue,
      fine_per_day: finePerDay,
      total_fine: totalFine,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (tx.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: tx.user_id,
        type: "warning",
        title: "Fine Issued",
        message: `A fine of \u20b1${totalFine} has been issued for "${tx.item_name}" (${daysOverdue} days overdue). Please return the item and settle the fine.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    console.log(`Fine created for transaction ${transactionId}: \u20b1${totalFine} (${daysOverdue} days overdue)`);
  } catch (err) {
    console.error(`Failed to create fine for transaction ${transactionId}:`, err.message);
  }
};

module.exports = { getAllFines, getMyFines, checkRestriction, getOverdueCount, payFine, waiveFine, createFineForOverdue };
