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
      createdAt: new Date(),
    });
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
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Item not found" });

    const current = doc.data();
    const quantity = Number(data.quantity ?? current.quantity) || 0;
    const previousBorrowed = Math.max(0, Number(current.quantity || 0) - Number(current.availableQuantity || 0));
    const availableQuantity = Math.max(0, quantity - previousBorrowed);

    await docRef.set({
      ...data,
      quantity,
      availableQuantity,
      available: availableQuantity > 0,
      status: availableQuantity > 0 ? "Available" : "Borrowed",
      updatedAt: new Date(),
    }, { merge: true });

    res.json({ message: "Item updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await db.collection(COLLECTION).doc(req.params.id).delete();
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
