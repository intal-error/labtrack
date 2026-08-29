const { db } = require("../config/firebase");

const COLLECTION = "catalog";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).get();
    const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Item not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const data = req.body;
    const quantity = Number(data.quantity) || 0;
    const adminId = req.user?.uid || "";
    let adminName = "";
    if (adminId) {
      try {
        const adminDoc = await db.collection("users").doc(adminId).get();
        if (adminDoc.exists) {
          const ad = adminDoc.data();
          adminName = `${ad.firstName || ""} ${ad.lastName || ""}`.trim();
        }
      } catch {}
    }
    const docRef = await db.collection(COLLECTION).add({
      itemName: data.itemName,
      category: data.category,
      course: data.course || "",
      quantity,
      condition: data.condition,
      status: data.status || "Available",
      imageUrl: data.imageUrl || "",
      barcode: data.barcode || "",
      availableQuantity: data.status === "Available" ? quantity : 0,
      available: data.status === "Available" && quantity > 0,
      // Admin tracking
      created_by_admin_id: adminId,
      created_by_admin_name: adminName,
      createdAt: new Date(),
    });

    try {
      const usersSnap = await db.collection("users").get();
      const notifPromises = usersSnap.docs
        .filter((doc) => {
          const role = doc.data().role;
          return role === "student";
        })
        .map((doc) =>
          db.collection("notifications").add({
            targetUserId: doc.id,
            type: "info",
            title: "New Catalog Item Available",
            message: `A new item "${data.itemName}" has been added to the catalog and is now available for borrowing.`,
            read: false,
            dismissedBy: [],
            link: "/catalog",
            createdAt: new Date(),
          })
        );
      await Promise.all(notifPromises);
    } catch {
      // Non-critical: item was created successfully, skip notification
    }

    res.status(201).json({ id: docRef.id, message: "Item created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const docRef = db.collection(COLLECTION).doc(id);

    await db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      if (!doc.exists) throw new Error("Item not found");

      const current = doc.data();
      const quantity = Number(data.quantity ?? current.quantity) || 0;
      const previousBorrowed = Math.max(0, Number(current.quantity || 0) - Number(current.availableQuantity || 0));

      if (quantity < previousBorrowed) {
        throw new Error(`Cannot reduce quantity below ${previousBorrowed} (currently borrowed). Return items first or keep quantity at ${previousBorrowed}+.`);
      }

      const availableQuantity = Math.max(0, quantity - previousBorrowed);

      const allowed = ["itemName", "category", "course", "condition", "status", "imageUrl", "barcode"];
      const sanitized = {};
      for (const key of allowed) {
        if (data[key] !== undefined) sanitized[key] = data[key];
      }

      t.set(docRef, {
        ...sanitized,
        quantity,
        availableQuantity,
        available: availableQuantity > 0,
        status: availableQuantity > 0 ? "Available" : "Borrowed",
        updatedAt: new Date(),
      }, { merge: true });
    });

    res.json({ message: "Item updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const itemDoc = await db.collection(COLLECTION).doc(id).get();
    if (!itemDoc.exists) return res.status(404).json({ error: "Item not found" });

    const item = itemDoc.data();
    const borrowed = Math.max(0, Number(item.quantity || 0) - Number(item.availableQuantity || 0));
    if (borrowed > 0) {
      return res.status(400).json({ error: `Cannot delete item with ${borrowed} active borrow(s). Return all items first.` });
    }

    const activeRequests = await db.collection("borrowRequests")
      .where("catalogId", "==", id)
      .where("status", "==", "pending")
      .get();
    if (!activeRequests.empty) {
      return res.status(400).json({ error: `Cannot delete item with ${activeRequests.size} pending borrow request(s). Reject or cancel them first.` });
    }

    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
