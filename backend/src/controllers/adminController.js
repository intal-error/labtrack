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

const getActiveAdmins = async (req, res) => {
  try {
    const snap = await db.collection("users").where("role", "==", "admin").get();
    const admins = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((a) => (a.status || "active") === "active");
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { firstName, lastName, email, password, contact, position, assignedCourse, assignedYear, permissions } = req.body;
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
      permissions: permissions || ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"],
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
      permissions: adminData.permissions,
      status: "active",
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
    const { firstName, lastName, contact, position, password, assignedCourse, assignedYear, permissions, status } = req.body;

    // Update in users collection
    const userDoc = await db.collection("users").doc(id).get();
    if (userDoc.exists) {
      const updateData = {
        firstName,
        lastName,
        contact: contact || "",
        position: position || "",
        assignedCourse: assignedCourse !== undefined ? assignedCourse : userDoc.data().assignedCourse || "",
        assignedYear: assignedYear !== undefined ? assignedYear : userDoc.data().assignedYear || "",
        updatedAt: new Date(),
      };
      if (permissions !== undefined) updateData.permissions = permissions;
      if (status !== undefined) updateData.status = status;
      await db.collection("users").doc(id).set(updateData, { merge: true });
    }

    // Also update in admins collection (legacy)
    for (const coll of ADMIN_COLLECTIONS) {
      const docRef = db.collection(coll).doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        const legacyData = {
          firstName: firstName,
          lastName: lastName,
          contact: contact || "",
          position: position || "",
          assignedCourse: assignedCourse !== undefined ? assignedCourse : doc.data().assignedCourse || "",
          assignedYear: assignedYear !== undefined ? assignedYear : doc.data().assignedYear || "",
        };
        if (permissions !== undefined) legacyData.permissions = permissions;
        if (status !== undefined) legacyData.status = status;
        await docRef.set(legacyData, { merge: true });
        break;
      }
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }
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

const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.uid === id) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ error: "Admin not found" });

    const current = userDoc.data();
    const newStatus = current.status === "active" ? "inactive" : "active";

    if (newStatus === "inactive") {
      const activeAdminsSnap = await db.collection("users")
        .where("role", "==", "admin")
        .where("status", "==", "active")
        .get();
      if (activeAdminsSnap.size <= 1) {
        return res.status(400).json({ error: "Cannot deactivate the last active admin" });
      }
    }

    await db.collection("users").doc(id).set({ status: newStatus, updatedAt: new Date() }, { merge: true });

    for (const coll of ADMIN_COLLECTIONS) {
      const docRef = db.collection(coll).doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.set({ status: newStatus }, { merge: true });
        break;
      }
    }

    res.json({ message: `Admin ${newStatus}`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.uid === id) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const activeAdminsSnap = await db.collection("users")
      .where("role", "==", "admin")
      .where("status", "==", "active")
      .get();
    if (activeAdminsSnap.size <= 1) {
      return res.status(400).json({ error: "Cannot deactivate the last active admin" });
    }

    await db.collection("users").doc(id).set({ status: "inactive", updatedAt: new Date() }, { merge: true });
    for (const coll of ADMIN_COLLECTIONS) {
      try {
        const docRef = db.collection(coll).doc(id);
        const doc = await docRef.get();
        if (doc.exists) {
          await docRef.set({ status: "inactive" }, { merge: true });
        }
      } catch (e) {}
    }
    try { await auth.updateUser(id, { disabled: true }); } catch (e) {}
    res.json({ message: "Admin deactivated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getActiveAdmins, create, update, toggleStatus, remove };
