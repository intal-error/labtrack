const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

const FINES = "fines";
const TRANS = "transactions";
const USERS = "users";
const NOTIF = "notifications";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  if (!date) return null;
  const d = toDate(date);
  return d ? d.toISOString() : null;
}

async function enrichFines(fines) {
  if (fines.length === 0) return [];

  const userIds = [...new Set(fines.map((f) => f.userId).filter(Boolean))];
  const txIds = [...new Set(fines.map((f) => f.transactionId).filter(Boolean))];

  const [userSnaps, txSnaps] = await Promise.all([
    Promise.all(userIds.map((id) => db.collection(USERS).doc(id).get())),
    Promise.all(txIds.map((id) => db.collection(TRANS).doc(id).get())),
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
  txSnaps.forEach((snap) => {
    if (snap.exists) {
      const d = snap.data();
      txMap[snap.id] = {
        dueDate: d.dueDate || null,
        borrowedAt: d.borrowedAt || d.timestamp || null,
        returnedAt: d.returnedAt || null,
        transactionStatus: d.status || "",
        itemId: d.itemId || "",
        course: d.course || "",
        schoolId: d.schoolID || d.schoolId || "",
        borrowerName: `${d.firstName || ""} ${d.lastName || ""}`.trim() || "",
      };
    }
  });

  return fines.map((f) => {
    const user = userMap[f.userId] || {};
    const tx = txMap[f.transactionId] || {};
    return {
      ...f,
      userName: user.userName || tx.borrowerName || f.userId || "Unknown",
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
    const snap = await db.collection(FINES).orderBy("createdAt", "desc").get();
    let fines = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    fines = await enrichFines(fines);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      fines = fines.filter(
        (f) =>
          (f.userName && f.userName.toLowerCase().includes(q)) ||
          (f.itemName && f.itemName.toLowerCase().includes(q)) ||
          (f.schoolId && f.schoolId.toLowerCase().includes(q)) ||
          (f.transactionId && f.transactionId.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      fines = fines.filter((f) => f.status === req.query.status);
    }

    if (req.query.course && req.query.course !== "All") {
      fines = fines.filter((f) => f.course === req.query.course);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(fines, page, limit));
    }

    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyFines = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(FINES)
      .where("userId", "==", uid)
      .get();
    let fines = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0));
        const db2 = b.createdAt?.toDate?.() || (b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0));
        return db2 - da;
      });

    fines = await enrichFines(fines);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      fines = fines.filter(
        (f) =>
          (f.itemName && f.itemName.toLowerCase().includes(q)) ||
          (f.transactionId && f.transactionId.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      fines = fines.filter((f) => f.status === req.query.status);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(fines, page, limit));
    }

    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const checkRestriction = async (req, res) => {
  try {
    const { userId } = req.params;
    const snap = await db.collection(FINES)
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();

    let totalPending = 0;
    snap.docs.forEach((doc) => {
      const fine = doc.data();
      totalPending += Number(fine.totalFine) || 0;
    });

    const settingsDoc = await db.collection("settings").doc("appSettings").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const threshold = Number(settings.fineRestrictionThreshold) || 50;

    res.json({
      isRestricted: totalPending >= threshold,
      totalPending,
      threshold,
      pendingCount: snap.size,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getOverdueCount = async (req, res) => {
  try {
    const snap = await db.collection(TRANS)
      .where("action", "==", "borrowed")
      .get();

    const now = new Date();
    const overdueUserIds = new Set();

    snap.docs.forEach((doc) => {
      const tx = doc.data();
      if (tx.status === "returned") return;
      const dueDate = toDate(tx.dueDate);
      if (dueDate && now > dueDate && tx.userId) {
        overdueUserIds.add(tx.userId);
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
    const fineRef = db.collection(FINES).doc(id);
    const fineSnap = await fineRef.get();
    if (!fineSnap.exists) return res.status(404).json({ error: "Fine not found" });

    const fine = fineSnap.data();
    if (fine.status === "paid") return res.status(400).json({ error: "Fine already paid" });

    await fineRef.set({
      status: "paid",
      paidAt: new Date(),
      paidBy: req.user.uid,
    }, { merge: true });

    if (fine.userId) {
      await db.collection(NOTIF).add({
        targetUserId: fine.userId,
        type: "success",
        title: "Fine Settled",
        message: `Your ₱${fine.totalFine} fine for "${fine.itemName}" has been marked as paid.`,
        read: false,
        dismissedBy: [],
        link: "/fines",
        createdAt: new Date(),
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
    const fineRef = db.collection(FINES).doc(id);
    const fineSnap = await fineRef.get();
    if (!fineSnap.exists) return res.status(404).json({ error: "Fine not found" });

    const fine = fineSnap.data();

    await fineRef.set({
      status: "waived",
      waivedBy: req.user.uid,
      waiveReason: reason.trim(),
      waivedAt: new Date(),
    }, { merge: true });

    if (fine.userId) {
      await db.collection(NOTIF).add({
        targetUserId: fine.userId,
        type: "info",
        title: "Fine Waived",
        message: `Your fine for "${fine.itemName}" (₱${fine.totalFine}) has been waived by the laboratory administrator.`,
        read: false,
        dismissedBy: [],
        link: "/fines",
        createdAt: new Date(),
      });
    }

    res.json({ message: "Fine waived" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createFineForOverdue = async (transactionId) => {
  try {
    const txSnap = await db.collection(TRANS).doc(transactionId).get();
    if (!txSnap.exists) return;

    const tx = txSnap.data();
    if (tx.action !== "borrowed") return;
    if (tx.status === "returned") return;

    const existing = await db.collection(FINES)
      .where("transactionId", "==", transactionId)
      .where("status", "==", "pending")
      .get();
    if (!existing.empty) return;

    const dueDate = toDate(tx.dueDate);
    if (!dueDate) return;

    const now = new Date();
    if (now <= dueDate) return;

    const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
    if (daysOverdue < 1) return;

    const settingsDoc = await db.collection("settings").doc("appSettings").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const finePerDay = Number(settings.finePerDay) || 5;

    const totalFine = daysOverdue * finePerDay;

    await db.collection(FINES).add({
      userId: tx.userId || "",
      transactionId,
      itemName: tx.itemName || "Unknown Item",
      daysOverdue,
      finePerDay,
      totalFine,
      status: "pending",
      createdAt: new Date(),
    });

    if (tx.userId) {
      await db.collection(NOTIF).add({
        targetUserId: tx.userId,
        type: "warning",
        title: "Fine Issued",
        message: `A fine of ₱${totalFine} has been issued for "${tx.itemName}" (${daysOverdue} days overdue). Please return the item and settle the fine.`,
        read: false,
        dismissedBy: [],
        link: "/fines",
        createdAt: new Date(),
      });
    }

    console.log(`Fine created for transaction ${transactionId}: ₱${totalFine} (${daysOverdue} days overdue)`);
  } catch (err) {
    console.error(`Failed to create fine for transaction ${transactionId}:`, err.message);
  }
};

module.exports = { getAllFines, getMyFines, checkRestriction, getOverdueCount, payFine, waiveFine, createFineForOverdue };
