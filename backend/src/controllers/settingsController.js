const { db } = require("../config/firebase");

const COLLECTION = "settings";
const DOC_ID = "appSettings";

const DEFAULTS = {
  emailNotifications: true,
  autoBackup: true,
  maintenanceMode: false,
  allowStudentRegistration: true,
  requirePasswordChange: false,
  sessionTimeout: 30,
  maxLoginAttempts: 5,
  defaultRole: "Student",
  finePerDay: 5,
  fineRestrictionThreshold: 50,
};

const getSettings = async (req, res) => {
  try {
    const doc = await db.collection(COLLECTION).doc(DOC_ID).get();
    if (doc.exists) {
      res.json({ id: doc.id, ...doc.data() });
    } else {
      await db.collection(COLLECTION).doc(DOC_ID).set(DEFAULTS);
      res.json({ id: DOC_ID, ...DEFAULTS });
    }
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const allowed = [
      "emailNotifications", "autoBackup", "maintenanceMode",
      "allowStudentRegistration", "requirePasswordChange",
      "sessionTimeout", "maxLoginAttempts", "defaultRole",
      "finePerDay", "fineRestrictionThreshold",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    updates.updatedAt = new Date();
    await db.collection(COLLECTION).doc(DOC_ID).set(updates, { merge: true });
    const doc = await db.collection(COLLECTION).doc(DOC_ID).get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getSettings, updateSettings };
