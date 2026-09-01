const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

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

async function getActiveAdminsList() {
  const snap = await db.collection(USERS)
    .where("role", "==", "admin")
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((a) => (a.status || "active") === "active");
}

function getAdminCourses(admin) {
  if (Array.isArray(admin.assignedCourses) && admin.assignedCourses.length > 0) {
    return admin.assignedCourses;
  }
  if (admin.assignedCourse) {
    return [admin.assignedCourse];
  }
  return [];
}

function isAdminForCourse(admin, course) {
  if (!course) return false;
  const courses = getAdminCourses(admin);
  return courses.includes(course);
}

function isSuperAdmin(admin) {
  return admin.role === "admin" && getAdminCourses(admin).length === 0;
}

async function autoAssignAdmin(targetCourse) {
  try {
    const admins = await getActiveAdminsList();
    if (admins.length === 0) return null;

    // Prefer admins whose assignedCourses includes the target course
    let candidates = admins;
    if (targetCourse) {
      const matched = admins.filter((a) => isAdminForCourse(a, targetCourse));
      if (matched.length > 0) candidates = matched;
    }

    // Count pending requests per admin to balance load
    const pendingSnap = await db.collection(REQUESTS)
      .where("status", "==", "pending")
      .get();
    const pendingCounts = {};
    pendingSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.assigned_admin_id) {
        pendingCounts[data.assigned_admin_id] = (pendingCounts[data.assigned_admin_id] || 0) + 1;
      }
    });

    // Pick admin with fewest pending requests
    candidates.sort((a, b) => (pendingCounts[a.id] || 0) - (pendingCounts[b.id] || 0));
    return candidates[0];
  } catch {
    return null;
  }
}

async function getTargetCourseAdmins(targetCourse) {
  if (!targetCourse) return [];
  const admins = await getActiveAdminsList();
  return admins.filter((a) => isAdminForCourse(a, targetCourse));
}

const getAllRequests = async (req, res) => {
  try {
    const snap = await db.collection(REQUESTS).orderBy("createdAt", "desc").get();
    let requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Filter by admin's assigned courses
    const reviewerDoc = await db.collection(USERS).doc(req.user.uid).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};

    if (!isSuperAdmin(reviewer)) {
      const adminCourses = getAdminCourses(reviewer);
      requests = requests.filter((r) => {
        const target = r.targetCourse || r.equipment_course || "";
        return adminCourses.includes(target);
      });
    }

    if (req.query.search) {
      const s = req.query.search.toLowerCase();
      requests = requests.filter((r) => {
        return (
          (r.firstName || "").toLowerCase().includes(s) ||
          (r.lastName || "").toLowerCase().includes(s) ||
          (r.itemName || "").toLowerCase().includes(s) ||
          (r.schoolID || "").toLowerCase().includes(s)
        );
      });
    }

    if (req.query.status && req.query.status !== "All") {
      requests = requests.filter((r) => (r.status || "").toLowerCase() === req.query.status.toLowerCase());
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = requests.length;
      const paged = requests.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(paged, total, page, limit));
    }

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(REQUESTS)
      .where("userId", "==", uid)
      .get();
    let requests = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const da = a.createdAt?.toDate?.() || (a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0));
        const db2 = b.createdAt?.toDate?.() || (b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0));
        return db2 - da;
      });

    if (req.query.search) {
      const s = req.query.search.toLowerCase();
      requests = requests.filter((r) => {
        return (
          (r.firstName || "").toLowerCase().includes(s) ||
          (r.lastName || "").toLowerCase().includes(s) ||
          (r.itemName || "").toLowerCase().includes(s) ||
          (r.schoolID || "").toLowerCase().includes(s)
        );
      });
    }

    if (req.query.status && req.query.status !== "All") {
      requests = requests.filter((r) => (r.status || "").toLowerCase() === req.query.status.toLowerCase());
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = requests.length;
      const paged = requests.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(paged, total, page, limit));
    }

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createRequest = async (req, res) => {
  try {
    const { itemId, quantity, dueDate, purpose, targetCourse } = req.body;
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

    // Use targetCourse from student selection, fallback to equipment course
    const equipmentCourse = item.course || "";
    const finalTargetCourse = targetCourse || equipmentCourse;

    // Validate dueDate
    const dueDateObj = new Date(dueDate);
    if (isNaN(dueDateObj.getTime())) {
      return res.status(400).json({ error: "Invalid due date format" });
    }

    // Auto-assign to the admin with fewest pending requests for this course
    const assignedAdmin = await autoAssignAdmin(finalTargetCourse);

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
      dueDate: dueDateObj,
      purpose: purpose || "",
      status: "pending",
      // Course info
      targetCourse: finalTargetCourse,
      equipment_course: equipmentCourse,
      equipment_category: item.category || "",
      // Admin assignment (auto-assigned to one admin, but all course admins can approve)
      assigned_admin_id: assignedAdmin?.id || "",
      assigned_admin_name: assignedAdmin ? `${assignedAdmin.firstName || ""} ${assignedAdmin.lastName || ""}`.trim() : "",
      // Reassignment history
      reassignment_history: [],
      createdAt: new Date(),
    };

    const docRef = await db.collection(REQUESTS).add(requestData);

    // Notify ALL admins assigned to the target course
    try {
      const targetAdmins = await getTargetCourseAdmins(finalTargetCourse);
      const adminList = targetAdmins.length > 0 ? targetAdmins : (await getActiveAdminsList());
      const BATCH_SIZE = 500;
      for (let i = 0; i < adminList.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = adminList.slice(i, i + BATCH_SIZE);
        chunk.forEach((admin) => {
          const ref = db.collection(NOTIF).doc();
          batch.set(ref, {
            targetUserId: admin.id,
            type: "info",
            title: "New Borrow Request",
            message: `${user.firstName} ${user.lastName} requested to borrow "${item.itemName}" (Qty: ${quantity}) — Course: ${finalTargetCourse}`,
            read: false,
            dismissedBy: [],
            link: "/borrow-requests",
            createdAt: new Date(),
          });
        });
        await batch.commit();
      }
    } catch (notifErr) {
      console.error("Failed to send borrow request notifications:", notifErr.message);
    }

    res.status(201).json({ message: "Borrow request submitted", id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
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

    // Course-based authorization: reviewer must be assigned to the target course
    const reviewerDoc = await db.collection(USERS).doc(reviewerId).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};
    const targetCourse = request.targetCourse || request.equipment_course || "";

    if (targetCourse && !isSuperAdmin(reviewer) && !isAdminForCourse(reviewer, targetCourse)) {
      return res.status(403).json({ error: "You are not authorized to approve requests for this course" });
    }

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
        // Equipment and admin info
        equipment_course: request.equipment_course || "",
        assigned_admin_id: request.assigned_admin_id || reviewerId,
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

    try {
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
    } catch (notifErr) {
      console.error("Failed to send approval notification:", notifErr.message);
    }

    res.json({ message: "Request approved and borrow recorded" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
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

    // Course-based authorization: reviewer must be assigned to the target course
    const reviewerDoc = await db.collection(USERS).doc(reviewerId).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};
    const targetCourse = request.targetCourse || request.equipment_course || "";

    if (targetCourse && !isSuperAdmin(reviewer) && !isAdminForCourse(reviewer, targetCourse)) {
      return res.status(403).json({ error: "You are not authorized to reject requests for this course" });
    }

    await requestRef.set({
      status: "rejected",
      reviewedBy: reviewerId,
      reviewerName: `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim(),
      reviewNotes: reviewNotes || "",
      reviewedAt: new Date(),
    }, { merge: true });

    try {
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
    } catch (notifErr) {
      console.error("Failed to send rejection notification:", notifErr.message);
    }

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const reassignRequest = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const { newAdminId, reason } = req.body;
    const reassignedBy = req.user.uid;

    if (!newAdminId) return res.status(400).json({ error: "New admin ID is required" });

    const requestRef = db.collection(REQUESTS).doc(id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) return res.status(404).json({ error: "Request not found" });

    const request = requestSnap.data();
    if (request.status !== "pending") return res.status(400).json({ error: "Can only reassign pending requests" });

    // Verify new admin exists and is active
    const newAdminDoc = await db.collection(USERS).doc(newAdminId).get();
    if (!newAdminDoc.exists) return res.status(404).json({ error: "Admin not found" });
    const newAdminData = newAdminDoc.data();
    if (newAdminData.role !== "admin") return res.status(400).json({ error: "Target user is not an admin" });
    if (newAdminData.status === "inactive") return res.status(400).json({ error: "Cannot assign to inactive admin" });

    // Verify new admin is assigned to the target course
    const targetCourse = request.targetCourse || request.equipment_course || "";
    if (targetCourse && !isSuperAdmin(newAdminData) && !isAdminForCourse(newAdminData, targetCourse)) {
      return res.status(400).json({ error: "Admin is not assigned to the target course" });
    }

    // Record reassignment history
    const historyEntry = {
      previousAdminId: request.assigned_admin_id || "",
      previousAdminName: request.assigned_admin_name || "",
      newAdminId: newAdminId,
      newAdminName: `${newAdminData.firstName || ""} ${newAdminData.lastName || ""}`.trim(),
      reassignedBy: reassignedBy,
      reassignedByName: "", // will be filled below
      date: new Date(),
      reason: reason || "",
    };

    // Get reassignedBy name
    const reassignerDoc = await db.collection(USERS).doc(reassignedBy).get();
    if (reassignerDoc.exists) {
      const rd = reassignerDoc.data();
      historyEntry.reassignedByName = `${rd.firstName || ""} ${rd.lastName || ""}`.trim();
    }

    const reassignmentHistory = [...(request.reassignment_history || []), historyEntry];

    await requestRef.set({
      assigned_admin_id: newAdminId,
      assigned_admin_name: historyEntry.newAdminName,
      reassignment_history: reassignmentHistory,
      updatedAt: new Date(),
    }, { merge: true });

    // Notify new admin
    await db.collection(NOTIF).add({
      targetUserId: newAdminId,
      type: "info",
      title: "Request Reassigned to You",
      message: `A borrow request from ${request.firstName} ${request.lastName} for "${request.itemName}" has been reassigned to you.`,
      read: false,
      dismissedBy: [],
      link: "/borrow-requests",
      createdAt: new Date(),
    });

    res.json({ message: "Request reassigned successfully" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest, reassignRequest };
