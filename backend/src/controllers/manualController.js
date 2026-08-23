const { db } = require("../config/firebase");

const COLLECTION = "manuals";
const USERS = "users";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));

    const userIds = [...new Set(items.map((m) => m.uploadedBy).filter(Boolean))];
    const userSnaps = await Promise.all(userIds.map((id) => db.collection(USERS).doc(id).get()));
    const userMap = {};
    userSnaps.forEach((s) => {
      if (s.exists) {
        const data = s.data();
        userMap[s.id] = `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || s.id;
      }
    });

    const enriched = items.map((m) => ({
      ...m,
      uploaderName: userMap[m.uploadedBy] || m.uploadedBy || "Unknown",
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const data = {
      ...req.body,
      uploadedBy: req.user.uid,
      createdAt: new Date().toISOString(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Manual not found" });
    const { title, description, category, fileUrl, fileName } = req.body;
    await db.collection(COLLECTION).doc(id).update({
      title,
      description,
      category,
      fileUrl,
      fileName,
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: "Manual updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Manual deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, create, update, remove };
