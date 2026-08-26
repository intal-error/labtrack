const { db } = require("../config/firebase");

const COLLECTION = "maintenance";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const allowed = ["title", "description", "scheduledDate", "type", "status", "priority", "assignedTo", "catalogId", "itemName", "photoURL"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    sanitized.createdBy = req.user.uid;
    sanitized.createdAt = new Date();
    const ref = await db.collection(COLLECTION).add(sanitized);
    res.status(201).json({ id: ref.id, message: "Maintenance scheduled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["title", "description", "scheduledDate", "type", "status", "priority", "assignedTo", "catalogId", "itemName", "photoURL"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    sanitized.updatedAt = new Date();
    await db.collection(COLLECTION).doc(id).set(sanitized, { merge: true });
    res.json({ message: "Maintenance updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, create, update, remove };
