const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

const COLLECTION = "incidents";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    let items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.reporterName && item.reporterName.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      items = items.filter((item) => item.status === req.query.status);
    }

    if (req.query.severity && req.query.severity !== "All") {
      items = items.filter((item) => item.severity === req.query.severity);
    }

    if (req.query.dateFrom) {
      const from = new Date(req.query.dateFrom);
      items = items.filter((item) => {
        const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return d >= from;
      });
    }

    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      items = items.filter((item) => {
        const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return d <= to;
      });
    }

    const { page, limit, offset, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice(offset, offset + limit);
      return res.json(paginatedResponse(paged, total, page, limit));
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyIncidents = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION)
      .where("reportedBy", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    let items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.reporterName && item.reporterName.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      items = items.filter((item) => item.status === req.query.status);
    }

    if (req.query.severity && req.query.severity !== "All") {
      items = items.filter((item) => item.severity === req.query.severity);
    }

    if (req.query.dateFrom) {
      const from = new Date(req.query.dateFrom);
      items = items.filter((item) => {
        const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return d >= from;
      });
    }

    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      items = items.filter((item) => {
        const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return d <= to;
      });
    }

    const { page, limit, offset, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice(offset, offset + limit);
      return res.json(paginatedResponse(paged, total, page, limit));
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, category, description, severity, reporterName, reporterRole } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }
    const data = {
      title,
      category: category || "",
      description,
      severity: severity || "low",
      reportedBy: req.user.uid,
      reporterName: reporterName || "",
      reporterRole: reporterRole || "student",
      status: "open",
      createdAt: new Date(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, message: "Incident reported" });
  } catch (err) {
    res.status(500).json({ error: "Failed to report incident" });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["status", "description", "severity", "assignedTo", "resolution", "title", "category"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    sanitized.updatedAt = new Date();
    await db.collection(COLLECTION).doc(id).set(sanitized, { merge: true });
    res.json({ message: "Incident updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Incident not found" });
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Incident deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getMyIncidents, create, update, remove };
