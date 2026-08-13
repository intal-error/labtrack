const { db } = require("../config/firebase");

const COLLECTION = "documents";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const documents = [];
    snap.forEach((doc) => documents.push({ id: doc.id, ...doc.data() }));
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll };
