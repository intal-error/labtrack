const { db, admin } = require("../config/firebase");

const COLLECTION = "notifications";

const getAll = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const notifications = [];
    snap.forEach((doc) => {
      const data = doc.data();
      const dismissedBy = data.dismissedBy || [];
      if (!dismissedBy.includes(userId)) {
        notifications.push({ id: doc.id, ...data });
      }
    });
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
      .get();
    const notifications = [];
    snap.forEach((doc) => {
      const data = doc.data();
      const dismissedBy = data.dismissedBy || [];
      if (!dismissedBy.includes(userId)) {
        notifications.push({ id: doc.id, ...data });
      }
    });
    notifications.sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return (db?.getTime?.() || 0) - (da?.getTime?.() || 0);
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    if (!["admin", "faculty"].includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const data = {
      ...req.body,
      read: false,
      dismissedBy: [],
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
    await db.collection(COLLECTION).doc(id).set(
      { read: true, readAt: new Date() },
      { merge: true }
    );
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
      .get();
    const batch = db.batch();
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.read !== true) {
        batch.set(doc.ref, {
          read: true,
          readAt: new Date(),
        }, { merge: true });
      }
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
    const userId = req.user.uid;
    await db.collection(COLLECTION).doc(id).set(
      { dismissedBy: admin.firestore.FieldValue.arrayUnion(userId) },
      { merge: true }
    );
    res.json({ message: "Notification dismissed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getByUser, create, markRead, markAllRead, dismiss };
