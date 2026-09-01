const { db, admin } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

const COLLECTION = "notifications";

const getAll = async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection("users").doc(userId).get();
    const isAdmin = userDoc.exists && userDoc.data().role === "admin";

    let notifications = [];
    if (isAdmin) {
      // Admins see notifications targeted to them (sorted in memory to avoid composite index)
      const snap = await db.collection(COLLECTION)
        .where("targetUserId", "==", userId)
        .get();
      snap.forEach((doc) => {
        const data = doc.data();
        const dismissedBy = data.dismissedBy || [];
        if (!dismissedBy.includes(userId)) {
          notifications.push({ id: doc.id, ...data });
        }
      });
      notifications.sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return (db2?.getTime?.() || 0) - (da?.getTime?.() || 0);
      });
    } else {
      // Non-admins see only their own notifications
      const snap = await db.collection(COLLECTION)
        .where("targetUserId", "==", userId)
        .get();
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
    }

    if (req.query.unreadOnly === "true") {
      notifications = notifications.filter((n) => !n.read);
    }

    const { paginate, page, pageSize } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(notifications, page, pageSize));
    }
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getByUser = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db.collection(COLLECTION)
      .where("targetUserId", "==", userId)
      .get();
    let notifications = [];
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

    if (req.query.unreadOnly === "true") {
      notifications = notifications.filter((n) => !n.read);
    }

    const { paginate, page, pageSize } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(notifications, page, pageSize));
    }
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { targetUserId, type, title, message, link } = req.body;
    if (!targetUserId || !type || !title || !message) {
      return res.status(400).json({ error: "targetUserId, type, title, and message are required" });
    }

    const data = {
      targetUserId,
      type,
      title,
      message,
      link: link || "",
      read: false,
      dismissedBy: [],
      createdAt: new Date(),
    };
    const ref = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: ref.id, message: "Notification created" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (doc.data().targetUserId !== userId) {
      return res.status(403).json({ error: "Not authorized to mark this notification" });
    }
    await db.collection(COLLECTION).doc(id).set(
      { read: true, readAt: new Date() },
      { merge: true }
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db.collection(COLLECTION)
      .where("targetUserId", "==", userId)
      .get();

    const BATCH_SIZE = 500;
    const docs = snap.docs.filter((doc) => doc.data().read !== true);

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      chunk.forEach((doc) => {
        batch.set(doc.ref, { read: true, readAt: new Date() }, { merge: true });
      });
      await batch.commit();
    }

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getByUser, create, markRead, markAllRead, dismiss };
