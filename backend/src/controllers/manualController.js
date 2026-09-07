const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const { randomUUID } = require("crypto");

const TABLE = "manuals";
const USERS = "users";

async function enrichWithUploaderNames(items) {
  const userIds = [...new Set(items.map((m) => m.uploaded_by).filter(Boolean))];
  if (userIds.length === 0) return items;
  const userSnaps = await Promise.all(userIds.map((id) => db.collection(USERS).doc(id).get()));
  const userMap = {};
  userSnaps.forEach((s) => {
    if (s.exists) {
      const data = s.data();
      userMap[s.id] = `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || s.id;
    }
  });
  return items.map((m) => ({
    ...m,
    uploaderName: userMap[m.uploaded_by] || m.uploaded_by || "Unknown",
  }));
}

const getAll = async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const enriched = await enrichWithUploaderNames(items || []);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getManual = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: item, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();
    if (error || !item) return res.status(404).json({ error: "Manual not found" });

    const enriched = await enrichWithUploaderNames([item]);
    res.json(enriched[0]);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, description, category, course, labRoom, status, fileUrl, fileName, fileSize, fileType, thumbnailUrl } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }
    const insertData = {
      id: randomUUID(),
      title: title || "",
      description: description || "",
      category: category || "",
      course: course || "",
      lab_room: labRoom || "",
      status: status || "Active",
      file_url: fileUrl || "",
      file_name: fileName || "",
      file_size: fileSize || "",
      file_type: fileType || "",
      thumbnail_url: thumbnailUrl || "",
      uploaded_by: req.user.uid,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from(TABLE)
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Manual not found" });

    const allowed = ["title", "description", "category", "course", "lab_room", "status", "file_url", "file_name", "file_size", "file_type", "thumbnail_url"];
    const camelToSnake = { labRoom: "lab_room", fileUrl: "file_url", fileName: "file_name", fileSize: "file_size", fileType: "file_type", thumbnailUrl: "thumbnail_url" };
    const updates = {};
    for (const [key, val] of Object.entries(req.body)) {
      const dbKey = camelToSnake[key] || key;
      if (allowed.includes(dbKey) && val !== undefined) {
        updates[dbKey] = val;
      }
    }
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "Manual updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Manual not found" });

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "Manual deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getManual, create, update, remove };
