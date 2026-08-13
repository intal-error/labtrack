const { db } = require("../config/firebase");

const COLLECTION = "notifications";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const notifications = [];
    snap.forEach((doc) => notifications.push({ id: doc.id, ...doc.data() }));
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const dismiss = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Notification dismissed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, dismiss };
