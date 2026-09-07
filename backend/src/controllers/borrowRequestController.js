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

async function getActiveAdminsList() {
  const snap = await db.collection("users")
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

    let candidates = admins;
    if (targetCourse) {
      const matched = admins.filter((a) => isAdminForCourse(a, targetCourse));
      if (matched.length > 0) candidates = matched;
    }

    const { data: pendingRequests } = await supabase
      .from("borrow_requests").select("assigned_admin_id")
      .eq("status", "pending");

    const pendingCounts = {};
    if (pendingRequests) {
      pendingRequests.forEach((r) => {
        if (r.assigned_admin_id) {
          pendingCounts[r.assigned_admin_id] = (pendingCounts[r.assigned_admin_id] || 0) + 1;
        }
      });
    }

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
    const { data: requests, error } = await supabase
      .from("borrow_requests").select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    let filtered = requests || [];

    const reviewerDoc = await db.collection("users").doc(req.user.uid).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};

    if (!isSuperAdmin(reviewer)) {
      const adminCourses = getAdminCourses(reviewer);
      filtered = filtered.filter((r) => {
        const target = r.target_course || r.equipment_course || "";
        return adminCourses.includes(target);
      });
    }

    if (req.query.search) {
      const s = req.query.search.toLowerCase();
      filtered = filtered.filter((r) => {
        return (
          (r.first_name || "").toLowerCase().includes(s) ||
          (r.last_name || "").toLowerCase().includes(s) ||
          (r.item_name || "").toLowerCase().includes(s) ||
          (r.school_id || "").toLowerCase().includes(s)
        );
      });
    }

    if (req.query.status && req.query.status !== "All") {
      filtered = filtered.filter((r) => (r.status || "").toLowerCase() === req.query.status.toLowerCase());
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = filtered.length;
      const paged = filtered.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(filtered));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { data: requests, error } = await supabase
      .from("borrow_requests").select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    let filtered = requests || [];

    if (req.query.search) {
      const s = req.query.search.toLowerCase();
      filtered = filtered.filter((r) => {
        return (
          (r.first_name || "").toLowerCase().includes(s) ||
          (r.last_name || "").toLowerCase().includes(s) ||
          (r.item_name || "").toLowerCase().includes(s) ||
          (r.school_id || "").toLowerCase().includes(s)
        );
      });
    }

    if (req.query.status && req.query.status !== "All") {
      filtered = filtered.filter((r) => (r.status || "").toLowerCase() === req.query.status.toLowerCase());
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = filtered.length;
      const paged = filtered.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(filtered));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createRequest = async (req, res) => {
  try {
    const { itemId, quantity, dueDate, purpose, targetCourse } = req.body;
    const uid = req.user.uid;

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
    const user = userSnap.data();

    const { data: item, error: itemError } = await supabase
      .from("catalog").select("*").eq("id", itemId).single();
    if (itemError || !item) return res.status(404).json({ error: "Catalog item not found" });

    const available = getAvailableQuantity(item);
    if (available < quantity) {
      return res.status(400).json({ error: `Only ${available} available for "${item.item_name}"` });
    }

    const { data: pendingRequests } = await supabase
      .from("borrow_requests").select("id")
      .eq("user_id", uid)
      .eq("status", "pending");
    if (pendingRequests && pendingRequests.length > 0 && user.role === "student") {
      return res.status(400).json({ error: "You already have a pending borrow request. Please wait for approval." });
    }

    const { data: pendingFines } = await supabase
      .from("fines").select("total_fine")
      .eq("user_id", uid)
      .eq("status", "pending");
    let totalPendingFines = 0;
    if (pendingFines) {
      pendingFines.forEach((f) => {
        totalPendingFines += Number(f.total_fine) || 0;
      });
    }

    const { data: settings } = await supabase
      .from("settings").select("*").eq("id", "appSettings").single();
    const threshold = Number(settings?.fine_restriction_threshold) || 50;

    if (totalPendingFines >= threshold) {
      return res.status(400).json({ error: `Your account is restricted due to unpaid fines (₱${totalPendingFines}). Please settle your fines first.` });
    }

    const equipmentCourse = item.course || "";
    const finalTargetCourse = targetCourse || equipmentCourse;

    const dueDateObj = new Date(dueDate);
    if (isNaN(dueDateObj.getTime())) {
      return res.status(400).json({ error: "Invalid due date format" });
    }

    const assignedAdmin = await autoAssignAdmin(finalTargetCourse);

    const requestData = {
      id: randomUUID(),
      user_id: uid,
      school_id: user.schoolId || user.employeeId || user.schoolID || "",
      first_name: user.firstName || "",
      last_name: user.lastName || "",
      course: user.course || "",
      year: user.year || "",
      email: user.email || "",
      role: user.role || "student",
      catalog_id: itemId,
      item_name: item.item_name,
      quantity: Number(quantity),
      due_date: dueDateObj.toISOString(),
      purpose: purpose || "",
      status: "pending",
      target_course: finalTargetCourse,
      equipment_course: equipmentCourse,
      equipment_category: item.category || "",
      assigned_admin_id: assignedAdmin?.id || "",
      assigned_admin_name: assignedAdmin ? `${assignedAdmin.firstName || ""} ${assignedAdmin.lastName || ""}`.trim() : "",
      reassignment_history: [],
      created_at: new Date().toISOString(),
    };

    const { data: newRequest, error: insertError } = await supabase
      .from("borrow_requests").insert(requestData).select().single();
    if (insertError) throw new Error(insertError.message);

    try {
      const targetAdmins = await getTargetCourseAdmins(finalTargetCourse);
      const adminList = targetAdmins.length > 0 ? targetAdmins : (await getActiveAdminsList());
      const notifications = adminList.map((admin) => ({
        id: randomUUID(),
        target_user_id: admin.id,
        type: "info",
        title: "New Borrow Request",
        message: `${user.firstName} ${user.lastName} requested to borrow "${item.item_name}" (Qty: ${quantity}) — Course: ${finalTargetCourse}`,
        read: false,
        dismissed_by: [],
        link: "/borrow-requests",
        created_at: new Date().toISOString(),
      }));
      if (notifications.length > 0) {
        const { error: notifError } = await supabase.from("notifications").insert(notifications);
        if (notifError) console.error("Failed to send borrow request notifications:", notifError.message);
      }
    } catch (notifErr) {
      console.error("Failed to send borrow request notifications:", notifErr.message);
    }

    res.status(201).json({ message: "Borrow request submitted", id: newRequest.id });
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

    const { data: request, error: reqError } = await supabase
      .from("borrow_requests").select("*").eq("id", id).single();
    if (reqError || !request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    const reviewerDoc = await db.collection("users").doc(reviewerId).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};
    const targetCourse = request.target_course || request.equipment_course || "";

    if (targetCourse && !isSuperAdmin(reviewer) && !isAdminForCourse(reviewer, targetCourse)) {
      return res.status(403).json({ error: "You are not authorized to approve requests for this course" });
    }

    const { data: catalogItem, error: catalogError } = await supabase
      .from("catalog").select("*").eq("id", request.catalog_id).single();
    if (catalogError || !catalogItem) throw new Error("Catalog item not found");

    const available = getAvailableQuantity(catalogItem);
    if (available < request.quantity) throw new Error(`Only ${available} available now`);

    const nextAvailable = available - request.quantity;
    const { error: updateCatalogError } = await supabase
      .from("catalog").update({
        available_quantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable > 0 ? "Available" : "Borrowed",
        updated_at: new Date().toISOString(),
      }).eq("id", request.catalog_id);
    if (updateCatalogError) throw new Error(updateCatalogError.message);

    const loanData = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      action: "borrowed",
      status: "borrowed",
      catalog_id: request.catalog_id,
      item_name: request.item_name,
      scan_code: `SLSU-TOOL:${request.catalog_id}`,
      quantity: request.quantity,
      returned_quantity: 0,
      quantity_remaining: request.quantity,
      school_id: request.school_id,
      first_name: request.first_name,
      last_name: request.last_name,
      course: request.course,
      year: request.year || "",
      email: request.email,
      user_id: request.user_id,
      due_date: request.due_date,
      timestamp: new Date().toISOString(),
      borrowed_at: new Date().toISOString(),
      equipment_course: request.equipment_course || "",
      assigned_admin_id: request.assigned_admin_id || reviewerId,
      approved_by: reviewerId,
      approved_at: new Date().toISOString(),
    };
    const { error: insertTransError } = await supabase.from("transactions").insert(loanData);
    if (insertTransError) throw new Error(insertTransError.message);

    const { error: updateReqError } = await supabase
      .from("borrow_requests").update({
        status: "approved",
        reviewed_by: reviewerId,
        reviewer_name: `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim(),
        review_notes: reviewNotes || "",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    if (updateReqError) throw new Error(updateReqError.message);

    try {
      const { error: notifError } = await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: request.user_id,
        type: "success",
        title: "Borrow Request Approved",
        message: `Your request to borrow "${request.item_name}" has been approved. You can now collect the item.`,
        read: false,
        dismissed_by: [],
        link: "/transactions",
        created_at: new Date().toISOString(),
      });
      if (notifError) console.error("Failed to send approval notification:", notifError.message);
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

    const { data: request, error: reqError } = await supabase
      .from("borrow_requests").select("*").eq("id", id).single();
    if (reqError || !request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    const reviewerDoc = await db.collection("users").doc(reviewerId).get();
    const reviewer = reviewerDoc.exists ? reviewerDoc.data() : {};
    const targetCourse = request.target_course || request.equipment_course || "";

    if (targetCourse && !isSuperAdmin(reviewer) && !isAdminForCourse(reviewer, targetCourse)) {
      return res.status(403).json({ error: "You are not authorized to reject requests for this course" });
    }

    const { error: updateError } = await supabase
      .from("borrow_requests").update({
        status: "rejected",
        reviewed_by: reviewerId,
        reviewer_name: `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim(),
        review_notes: reviewNotes || "",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    try {
      const { error: notifError } = await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: request.user_id,
        type: "warning",
        title: "Borrow Request Rejected",
        message: `Your request to borrow "${request.item_name}" has been rejected.${reviewNotes ? ` Reason: ${reviewNotes}` : ""}`,
        read: false,
        dismissed_by: [],
        link: "/my-requests",
        created_at: new Date().toISOString(),
      });
      if (notifError) console.error("Failed to send rejection notification:", notifError.message);
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

    const { data: request, error: reqError } = await supabase
      .from("borrow_requests").select("*").eq("id", id).single();
    if (reqError || !request) return res.status(404).json({ error: "Request not found" });
    if (request.user_id !== uid) return res.status(403).json({ error: "Not authorized" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    const { error: updateError } = await supabase
      .from("borrow_requests").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    if (updateError) throw new Error(updateError.message);

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

    const { data: request, error: reqError } = await supabase
      .from("borrow_requests").select("*").eq("id", id).single();
    if (reqError || !request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Can only reassign pending requests" });

    const newAdminDoc = await db.collection("users").doc(newAdminId).get();
    if (!newAdminDoc.exists) return res.status(404).json({ error: "Admin not found" });
    const newAdminData = newAdminDoc.data();
    if (newAdminData.role !== "admin") return res.status(400).json({ error: "Target user is not an admin" });
    if (newAdminData.status === "inactive") return res.status(400).json({ error: "Cannot assign to inactive admin" });

    const targetCourse = request.target_course || request.equipment_course || "";
    if (targetCourse && !isSuperAdmin(newAdminData) && !isAdminForCourse(newAdminData, targetCourse)) {
      return res.status(400).json({ error: "Admin is not assigned to the target course" });
    }

    const historyEntry = {
      previous_admin_id: request.assigned_admin_id || "",
      previous_admin_name: request.assigned_admin_name || "",
      new_admin_id: newAdminId,
      new_admin_name: `${newAdminData.firstName || ""} ${newAdminData.lastName || ""}`.trim(),
      reassigned_by: reassignedBy,
      reassigned_by_name: "",
      date: new Date().toISOString(),
      reason: reason || "",
    };

    const reassignerDoc = await db.collection("users").doc(reassignedBy).get();
    if (reassignerDoc.exists) {
      const rd = reassignerDoc.data();
      historyEntry.reassigned_by_name = `${rd.firstName || ""} ${rd.lastName || ""}`.trim();
    }

    const reassignmentHistory = [...(request.reassignment_history || []), historyEntry];

    const { error: updateError } = await supabase
      .from("borrow_requests").update({
        assigned_admin_id: newAdminId,
        assigned_admin_name: historyEntry.new_admin_name,
        reassignment_history: reassignmentHistory,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    try {
      const { error: notifError } = await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: newAdminId,
        type: "info",
        title: "Request Reassigned to You",
        message: `A borrow request from ${request.first_name} ${request.last_name} for "${request.item_name}" has been reassigned to you.`,
        read: false,
        dismissed_by: [],
        link: "/borrow-requests",
        created_at: new Date().toISOString(),
      });
      if (notifError) console.error("Failed to send reassignment notification:", notifError.message);
    } catch (notifErr) {
      console.error("Failed to send reassignment notification:", notifErr.message);
    }

    res.json({ message: "Request reassigned successfully" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest, reassignRequest };
