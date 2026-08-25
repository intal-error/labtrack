const { db } = require("../config/firebase");

const REQUESTS = "borrowRequests";
const TRANS = "transactions";
const CATALOG = "catalog";
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

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAvailableQuantity(item) {
  if (Number.isFinite(Number(item?.availableQuantity))) {
    return Math.max(0, numberOr(item.availableQuantity));
  }
  const quantity = Math.max(0, numberOr(item?.quantity));
  return (item?.status || "").toLowerCase() === "borrowed" ? 0 : quantity;
}

const getAllRequests = async (req, res) => {
  try {
    const snap = await db.collection(REQUESTS).orderBy("createdAt", "desc").get();
    let requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    // Filter by course for admin users with assigned course
    if (req.adminAssignment?.assignedCourse) {
      requests = requests.filter((r) => r.course === req.adminAssignment.assignedCourse);
    }
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(REQUESTS)
      .where("userId", "==", uid)
      .get();
    const requests = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0));
        const db2 = b.createdAt?.toDate?.() || (b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0));
        return db2 - da;
      });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createRequest = async (req, res) => {
  try {
    const { itemId, quantity, dueDate, purpose } = req.body;
    const uid = req.user.uid;

    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
    const user = userSnap.data();

    const itemSnap = await db.collection(CATALOG).doc(itemId).get();
    if (!itemSnap.exists) return res.status(404).json({ error: "Catalog item not found" });
    const item = itemSnap.data();

    const available = getAvailableQuantity(item);
    if (available < quantity) {
      return res.status(400).json({ error: `Only ${available} available for "${item.itemName}"` });
    }

    const pendingSnap = await db.collection(REQUESTS)
      .where("userId", "==", uid)
      .where("status", "==", "pending")
      .get();
    if (!pendingSnap.empty && user.role === "student") {
      return res.status(400).json({ error: "You already have a pending borrow request. Please wait for approval." });
    }

    const finesSnap = await db.collection("fines")
      .where("userId", "==", uid)
      .where("status", "==", "pending")
      .get();
    let totalPendingFines = 0;
    finesSnap.docs.forEach((doc) => {
      totalPendingFines += Number(doc.data().totalFine) || 0;
    });

    const settingsDoc = await db.collection("settings").doc("appSettings").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const threshold = Number(settings.fineRestrictionThreshold) || 50;

    if (totalPendingFines >= threshold) {
      return res.status(400).json({ error: `Your account is restricted due to unpaid fines (₱${totalPendingFines}). Please settle your fines first.` });
    }

    const requestData = {
      userId: uid,
      schoolID: user.schoolId || user.employeeId || user.schoolID || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      course: user.course || "",
      year: user.year || "",
      email: user.email || "",
      role: user.role || "student",
      catalogId: itemId,
      itemName: item.itemName,
      quantity: Number(quantity),
      dueDate: new Date(dueDate),
      purpose: purpose || "",
      status: "pending",
      createdAt: new Date(),
    };

    const docRef = await db.collection(REQUESTS).add(requestData);

    // Notify admins assigned to the student's course, fallback to all admins
    let adminsSnap;
    if (user.course) {
      adminsSnap = await db.collection(USERS)
        .where("role", "==", "admin")
        .where("assignedCourse", "==", user.course)
        .get();
    }
    if (!adminsSnap || adminsSnap.empty) {
      adminsSnap = await db.collection(USERS).where("role", "==", "admin").get();
    }
    for (const adminDoc of adminsSnap.docs) {
      await db.collection(NOTIF).add({
        targetUserId: adminDoc.id,
        type: "info",
        title: "New Borrow Request",
        message: `${user.firstName} ${user.lastName} requested to borrow "${item.itemName}" (Qty: ${quantity})`,
        read: false,
        dismissedBy: [],
        link: "/borrow-requests",
        createdAt: new Date(),
      });
    }

    res.status(201).json({ message: "Borrow request submitted", id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const { reviewNotes } = req.body;
    const reviewerId = req.user.uid;

    const requestRef = db.collection(REQUESTS).doc(id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) return res.status(404).json({ error: "Request not found" });

    const request = requestSnap.data();
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    // Course-based access control: admin can only approve requests from their assigned course
    if (req.adminAssignment?.assignedCourse && request.course !== req.adminAssignment.assignedCourse) {
      return res.status(403).json({ error: "You do not have permission to approve requests for this course" });
    }

    const reviewerSnap = await db.collection(USERS).doc(reviewerId).get();
    const reviewer = reviewerSnap.exists ? reviewerSnap.data() : {};

    await db.runTransaction(async (t) => {
      const catalogRef = db.collection(CATALOG).doc(request.catalogId);
      const catalogSnap = await t.get(catalogRef);
      if (!catalogSnap.exists) throw new Error("Catalog item not found");

      const current = catalogSnap.data();
      const available = getAvailableQuantity(current);
      if (available < request.quantity) throw new Error(`Only ${available} available now`);

      const nextAvailable = available - request.quantity;

      t.set(catalogRef, {
        availableQuantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable > 0 ? "Available" : "Borrowed",
        updatedAt: new Date(),
      }, { merge: true });

      const borrowRef = db.collection(TRANS).doc();
      const loanData = {
        action: "borrowed",
        status: "borrowed",
        catalogId: request.catalogId,
        itemName: request.itemName,
        scanCode: `SLSU-TOOL:${request.catalogId}`,
        quantity: request.quantity,
        returnedQuantity: 0,
        quantityRemaining: request.quantity,
        schoolID: request.schoolID,
        firstName: request.firstName,
        lastName: request.lastName,
        course: request.course,
        year: request.year || "",
        email: request.email,
        userId: request.userId,
        dueDate: request.dueDate,
        timestamp: new Date(),
        borrowedAt: new Date(),
        approvedBy: reviewerId,
        approvedAt: new Date(),
      };
      t.set(borrowRef, loanData);

      const userRef = db.collection(USERS).doc(request.userId);
      t.set(userRef, {
        schoolID: request.schoolID,
        firstName: request.firstName,
        lastName: request.lastName,
        role: request.role,
        updatedAt: new Date(),
      }, { merge: true });

      t.set(userRef.collection("borrowed").doc(borrowRef.id), {
        transactionId: borrowRef.id,
        catalogId: request.catalogId,
        itemName: request.itemName,
        quantity: request.quantity,
        returnedQuantity: 0,
        quantityRemaining: request.quantity,
        status: "borrowed",
        dueDate: request.dueDate,
        timestamp: new Date(),
      });
    });

    await requestRef.set({
      status: "approved",
      reviewedBy: reviewerId,
      reviewerName: `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim(),
      reviewNotes: reviewNotes || "",
      reviewedAt: new Date(),
    }, { merge: true });

    await db.collection(NOTIF).add({
      targetUserId: request.userId,
      type: "success",
      title: "Borrow Request Approved",
      message: `Your request to borrow "${request.itemName}" has been approved. You can now collect the item.`,
      read: false,
      dismissedBy: [],
      link: "/transactions",
      createdAt: new Date(),
    });

    res.json({ message: "Request approved and borrow recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const rejectRequest = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const { reviewNotes } = req.body;
    const reviewerId = req.user.uid;

    const requestRef = db.collection(REQUESTS).doc(id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) return res.status(404).json({ error: "Request not found" });

    const request = requestSnap.data();
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    // Course-based access control: admin can only reject requests from their assigned course
    if (req.adminAssignment?.assignedCourse && request.course !== req.adminAssignment.assignedCourse) {
      return res.status(403).json({ error: "You do not have permission to reject requests for this course" });
    }

    const reviewerSnap = await db.collection(USERS).doc(reviewerId).get();
    const reviewer = reviewerSnap.exists ? reviewerSnap.data() : {};

    await requestRef.set({
      status: "rejected",
      reviewedBy: reviewerId,
      reviewerName: `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim(),
      reviewNotes: reviewNotes || "",
      reviewedAt: new Date(),
    }, { merge: true });

    await db.collection(NOTIF).add({
      targetUserId: request.userId,
      type: "warning",
      title: "Borrow Request Rejected",
      message: `Your request to borrow "${request.itemName}" has been rejected.${reviewNotes ? ` Reason: ${reviewNotes}` : ""}`,
      read: false,
      dismissedBy: [],
      link: "/my-requests",
      createdAt: new Date(),
    });

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;

    const requestRef = db.collection(REQUESTS).doc(id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) return res.status(404).json({ error: "Request not found" });

    const request = requestSnap.data();
    if (request.userId !== uid) return res.status(403).json({ error: "Not authorized" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    await requestRef.set({ status: "cancelled", cancelledAt: new Date() }, { merge: true });

    res.json({ message: "Request cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest };
