const { supabase } = require("../config/supabase");
const { transformKeys } = require("../utils/transformKeys");

const TABLE = "documents";

const getAll = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(transformKeys(data));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id")
      .eq("id", req.params.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Document not found" });

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, deleteDocument };
