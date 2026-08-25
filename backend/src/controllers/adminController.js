const { db, auth } = require("../config/firebase");

const ADMIN_COLLECTIONS = ["admin", "admins"];

const getAll = async (req, res) => {
  try {
    const admins = [];
    // Read from users collection where role=admin
    const usersSnap = await db.collection("users").where("role", "==", "admin").get();
    usersSnap.forEach((doc) => admins.push({ id: doc.id, ...doc.data() }));

    // Also include any admins only in the admins collection (legacy)
    const adminsSnap = await db.collection("admins").get();
    adminsSnap.forEach((doc) => {
      if (!admins.find((a) => a.id === doc.id)) {
        admins.push({ id: doc.id, collection: "admins", ...doc.data() });
      }
    });

    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { firstName, lastName, email, password, contact, position, assignedCourse, assignedYear } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    const userRecord = await auth.createUser({ email, password, displayName: `${firstName} ${lastName}` });

    // Set custom claims so authorize() middleware works
    await auth.setCustomUserClaims(userRecord.uid, { role: "admin" });

    const adminData = {
      firstName,
      lastName,
      email,
      contact: contact || "",
      position: position || "",
      assignedCourse: assignedCourse || "",
      assignedYear: assignedYear || "",
      role: "admin",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in users collection so AuthContext can read the role
    await db.collection("users").doc(userRecord.uid).set(adminData);

    // Also store in admins collection for backward compatibility
    await db.collection("admins").doc(userRecord.uid).set({
      firstName: firstName,
      lastName: lastName,
      contact: contact || "",
      position: position || "",
      assignedCourse: assignedCourse || "",
      assignedYear: assignedYear || "",
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
    const { firstName, lastName, contact, position, password, assignedCourse, assignedYear } = req.body;

    // Update in users collection
    const userDoc = await db.collection("users").doc(id).get();
    if (userDoc.exists) {
      await db.collection("users").doc(id).set({
        firstName,
        lastName,
        contact: contact || "",
        position: position || "",
        assignedCourse: assignedCourse !== undefined ? assignedCourse : userDoc.data().assignedCourse || "",
        assignedYear: assignedYear !== undefined ? assignedYear : userDoc.data().assignedYear || "",
        updatedAt: new Date(),
      }, { merge: true });
    }

    // Also update in admins collection (legacy)
    for (const coll of ADMIN_COLLECTIONS) {
      const docRef = db.collection(coll).doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.set({
          firstName: firstName,
          lastName: lastName,
          contact: contact || "",
          position: position || "",
          assignedCourse: assignedCourse !== undefined ? assignedCourse : doc.data().assignedCourse || "",
          assignedYear: assignedYear !== undefined ? assignedYear : doc.data().assignedYear || "",
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
    // Delete from users collection
    try { await db.collection("users").doc(id).delete(); } catch (e) {}
    // Delete from admins collection (legacy)
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
