const { db, auth } = require("../config/firebase");

const ADMIN_COLLECTIONS = ["admin", "admins"];

const getAll = async (req, res) => {
  try {
    const admins = [];
    for (const coll of ADMIN_COLLECTIONS) {
      try {
        const snap = await db.collection(coll).get();
        snap.forEach((doc) => admins.push({ id: doc.id, collection: coll, ...doc.data() }));
      } catch (e) {
        // collection may not exist
      }
    }
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { firstName, lastName, email, password, contact, position } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    const userRecord = await auth.createUser({ email, password, displayName: `${firstName} ${lastName}` });
    await db.collection("admins").doc(userRecord.uid).set({
      firstname: firstName,
      lastname: lastName,
      contact: contact || "",
      position: position || "",
      email,
      createdAt: new Date(),
    });

    res.status(201).json({ id: userRecord.uid, message: "Admin created" });
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, contact, position, password } = req.body;

    for (const coll of ADMIN_COLLECTIONS) {
      const docRef = db.collection(coll).doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.set({
          firstname: firstName,
          lastname: lastName,
          contact: contact || "",
          position: position || "",
        }, { merge: true });
        break;
      }
    }

    if (password) {
      try {
        await auth.updateUser(id, { password });
      } catch (e) {
        console.warn("Could not update auth password:", e.message);
      }
    }

    res.json({ message: "Admin updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    for (const coll of ADMIN_COLLECTIONS) {
      try { await db.collection(coll).doc(id).delete(); } catch (e) {}
    }
    try { await auth.deleteUser(id); } catch (e) {}
    res.json({ message: "Admin deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, create, update, remove };
