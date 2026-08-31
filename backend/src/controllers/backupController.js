const { db } = require("../config/firebase");

const COLLECTIONS = [
  "users", "admins", "catalog", "transactions", "notifications",
  "documents", "manuals", "maintenance", "incidents", "fines", "settings",
];

const exportBackup = async (req, res) => {
  try {
    const backup = { createdAt: new Date().toISOString(), collections: {} };

    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      backup.collections[col] = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    let totalDocs = 0;
    for (const col of COLLECTIONS) {
      totalDocs += (backup.collections[col] || []).length;
    }
    backup.totalDocuments = totalDocs;

    const backupDoc = await db.collection("backups").add({
      createdAt: new Date(),
      totalDocuments: totalDocs,
      collections: COLLECTIONS,
      createdBy: req.user.uid,
    });

    res.json({
      id: backupDoc.id,
      ...backup,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const downloadBackup = async (req, res) => {
  try {
    const backup = { createdAt: new Date().toISOString(), collections: {} };

    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      backup.collections[col] = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    let totalDocs = 0;
    for (const col of COLLECTIONS) {
      totalDocs += (backup.collections[col] || []).length;
    }
    backup.totalDocuments = totalDocs;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=labtrack_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const importBackup = async (req, res) => {
  try {
    const { backupData, overwrite } = req.body;
    if (!backupData || !backupData.collections) {
      return res.status(400).json({ error: "Invalid backup data" });
    }

    let imported = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    for (const col of COLLECTIONS) {
      const docs = backupData.collections[col];
      if (!docs || !Array.isArray(docs)) continue;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + BATCH_SIZE);

        for (const doc of chunk) {
          const { id, ...data } = doc;
          if (!id) continue;

          if (!overwrite) {
            const existing = await db.collection(col).doc(id).get();
            if (existing.exists) {
              skipped++;
              continue;
            }
          }

          batch.set(db.collection(col).doc(id), data, { merge: true });
          imported++;
        }

        await batch.commit();
      }
    }

    await db.collection("backups").add({
      createdAt: new Date(),
      type: "import",
      imported,
      skipped,
      overwrite,
      createdBy: req.user.uid,
    });

    res.json({
      message: "Backup imported successfully",
      imported,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getBackupHistory = async (req, res) => {
  try {
    const snap = await db.collection("backups")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    const history = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { exportBackup, downloadBackup, importBackup, getBackupHistory };
