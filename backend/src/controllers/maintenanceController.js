const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

const COLLECTION = "maintenance";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    let items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));

    items = items.map((item) => {
      if (!item.findings && item.description) item.findings = item.description;
      if (!item.assignedPersonnel && item.assignedTo) item.assignedPersonnel = item.assignedTo;
      if (!item.inspectedDate && item.scheduledDate) item.inspectedDate = item.scheduledDate;
      return item;
    });

    if (req.query.search) {
      const search = req.query.search.toLowerCase();
      items = items.filter((item) => {
        const itemName = (item.itemName || "").toLowerCase();
        const collegeBuilding = (item.collegeBuilding || "").toLowerCase();
        const location = (item.location || "").toLowerCase();
        const findings = (item.findings || "").toLowerCase();
        const inspectedBy = (item.inspectedBy || "").toLowerCase();
        const notedBy = (item.notedBy || "").toLowerCase();
        const assignedTo = (item.assignedTo || "").toLowerCase();
        const assignedPersonnel = (item.assignedPersonnel || "").toLowerCase();
        return itemName.includes(search) || collegeBuilding.includes(search) || location.includes(search) || findings.includes(search) || inspectedBy.includes(search) || notedBy.includes(search) || assignedTo.includes(search) || assignedPersonnel.includes(search);
      });
    }

    if (req.query.status && req.query.status !== "All") {
      items = items.filter((item) => item.status === req.query.status);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const start = (page - 1) * limit;
      const sliced = items.slice(start, start + limit);
      return res.json(paginatedResponse(sliced, total, page, limit));
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const allowed = ["title", "description", "scheduledDate", "type", "status", "priority", "assignedTo", "catalogId", "itemName", "photoURL", "collegeBuilding", "location", "findings", "recommendation", "materialsNeeded", "estimatedDays", "dateStarted", "dateFinished", "remarks", "inspectedBy", "notedBy", "inspectedDate", "assignedPersonnel"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    sanitized.createdBy = req.user.uid;
    sanitized.createdAt = new Date();
    const ref = await db.collection(COLLECTION).add(sanitized);
    res.status(201).json({ id: ref.id, message: "Maintenance scheduled" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["title", "description", "scheduledDate", "type", "status", "priority", "assignedTo", "catalogId", "itemName", "photoURL", "collegeBuilding", "location", "findings", "recommendation", "materialsNeeded", "estimatedDays", "dateStarted", "dateFinished", "remarks", "inspectedBy", "notedBy", "inspectedDate", "assignedPersonnel"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    sanitized.updatedAt = new Date();
    await db.collection(COLLECTION).doc(id).set(sanitized, { merge: true });
    res.json({ message: "Maintenance updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Maintenance record not found" });
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Maintenance deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, create, update, remove };
