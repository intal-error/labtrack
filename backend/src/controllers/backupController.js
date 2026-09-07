const { supabase } = require("../config/supabase");
const { randomUUID } = require("crypto");

const COLLECTIONS = [
  "catalog", "transactions", "notifications",
  "documents", "manuals", "maintenance", "incidents", "fines", "settings",
  "borrow_requests", "lab_attendance", "lab_rooms",
];

const exportBackup = async (req, res) => {
  try {
    const backup = { createdAt: new Date().toISOString(), collections: {} };

    for (const col of COLLECTIONS) {
      const { data, error } = await supabase.from(col).select("*");
      if (error) throw error;
      backup.collections[col] = data || [];
    }

    let totalDocs = 0;
    for (const col of COLLECTIONS) {
      totalDocs += (backup.collections[col] || []).length;
    }
    backup.totalDocuments = totalDocs;

    const { data: backupDoc, error: insertError } = await supabase
      .from("backups")
      .insert({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        total_documents: totalDocs,
        collections: COLLECTIONS,
        created_by: req.user.uid,
      })
      .select()
      .single();

    if (insertError) throw insertError;

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
      const { data, error } = await supabase.from(col).select("*");
      if (error) throw error;
      backup.collections[col] = data || [];
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

    for (const col of COLLECTIONS) {
      const docs = backupData.collections[col];
      if (!docs || !Array.isArray(docs)) continue;

      if (overwrite) {
        const docsToUpsert = docs.filter((doc) => doc.id);
        if (docsToUpsert.length > 0) {
          const { error } = await supabase
            .from(col)
            .upsert(docsToUpsert, { onConflict: "id" });
          if (error) throw error;
          imported += docsToUpsert.length;
        }
      } else {
        const ids = docs.filter((doc) => doc.id).map((doc) => doc.id);
        if (ids.length === 0) continue;

        const { data: existing } = await supabase
          .from(col)
          .select("id")
          .in("id", ids);

        const existingIds = new Set((existing || []).map((e) => e.id));
        const newDocs = docs.filter((doc) => doc.id && !existingIds.has(doc.id));
        skipped += ids.length - newDocs.length;

        if (newDocs.length > 0) {
          const { error } = await supabase
            .from(col)
            .upsert(newDocs, { onConflict: "id" });
          if (error) throw error;
          imported += newDocs.length;
        }
      }
    }

    await supabase.from("backups").insert({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      type: "import",
      imported,
      skipped,
      overwrite,
      created_by: req.user.uid,
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
    const { data, error } = await supabase
      .from("backups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { exportBackup, downloadBackup, importBackup, getBackupHistory };
