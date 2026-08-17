const { db } = require("../config/firebase");

const COLLECTION = "incidents";

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

const getMyIncidents = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION)
      .where("reportedBy", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const data = {
      ...req.body,
      reportedBy: req.user.uid,
      reporterName: req.body.reporterName || "",
      reporterRole: req.body.reporterRole || "student",
      status: "open",
      createdAt: new Date(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, message: "Incident reported" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body, updatedAt: new Date().toISOString() };
    await db.collection(COLLECTION).doc(id).set(data, { merge: true });
    res.json({ message: "Incident updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getMyIncidents, create, update, remove };
