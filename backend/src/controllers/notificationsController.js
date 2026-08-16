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

const getByUser = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db.collection(COLLECTION)
      .where("targetUserId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    const notifications = [];
    snap.forEach((doc) => notifications.push({ id: doc.id, ...doc.data() }));
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const data = {
      ...req.body,
      read: false,
      createdAt: new Date(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, message: "Notification created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).set({ read: true, readAt: new Date() }, { merge: true });
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db.collection(COLLECTION)
      .where("targetUserId", "==", userId)
      .where("read", "==", false)
      .get();
    const batch = db.batch();
    snap.forEach((doc) => {
      batch.set(doc.ref, { read: true, readAt: new Date() }, { merge: true });
    });
    await batch.commit();
    res.json({ message: "All notifications marked as read" });
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

module.exports = { getAll, getByUser, create, markRead, markAllRead, dismiss };
