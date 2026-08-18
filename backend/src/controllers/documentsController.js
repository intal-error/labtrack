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

const deleteDocument = async (req, res) => {
  try {
    await db.collection(COLLECTION).doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, deleteDocument };
