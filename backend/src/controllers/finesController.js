const { db } = require("../config/firebase");

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

const getAllFines = async (req, res) => {
  try {
    const snap = await db.collection(FINES).orderBy("createdAt", "desc").get();
    const fines = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyFines = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(FINES)
      .where("userId", "==", uid)
      .get();
    const fines = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0));
        const db2 = b.createdAt?.toDate?.() || (b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0));
        return db2 - da;
      });
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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

    res.json({ message: "Fine marked as paid" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const waiveFine = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const fineRef = db.collection(FINES).doc(id);
    const fineSnap = await fineRef.get();
    if (!fineSnap.exists) return res.status(404).json({ error: "Fine not found" });

    await fineRef.set({
      status: "waived",
      waivedBy: req.user.uid,
      waiveReason: reason || "",
      waivedAt: new Date(),
    }, { merge: true });

    res.json({ message: "Fine waived" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
        link: "/transactions",
        createdAt: new Date(),
      });
    }

    console.log(`Fine created for transaction ${transactionId}: ₱${totalFine} (${daysOverdue} days overdue)`);
  } catch (err) {
    console.error(`Failed to create fine for transaction ${transactionId}:`, err.message);
  }
};

module.exports = { getAllFines, getMyFines, checkRestriction, payFine, waiveFine, createFineForOverdue };
