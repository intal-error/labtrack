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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, description, category, fileUrl, fileName } = req.body;
    const data = {
      title: title || "",
      description: description || "",
      category: category || "",
      fileUrl: fileUrl || "",
      fileName: fileName || "",
      uploadedBy: req.user.uid,
      createdAt: new Date(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Manual not found" });
    const updates = {};
    const { title, description, category, fileUrl, fileName } = req.body;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (fileUrl !== undefined) updates.fileUrl = fileUrl;
    if (fileName !== undefined) updates.fileName = fileName;
    updates.updatedAt = new Date();
    await db.collection(COLLECTION).doc(id).update(updates);
    res.json({ message: "Manual updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Manual not found" });
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Manual deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, create, update, remove };
