const { supabase } = require("../config/supabase");

const TABLE = "settings";
const DOC_ID = "appSettings";

const DEFAULTS = {
  id: DOC_ID,
  email_notifications: true,
  auto_backup: true,
  maintenance_mode: false,
  allow_student_registration: true,
  require_password_change: false,
  session_timeout: 30,
  max_login_attempts: 5,
  default_role: "Student",
  fine_per_day: 5,
  fine_restriction_threshold: 50,
};

const getSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", DOC_ID)
      .single();

    if (error && error.code === "PGRST116") {
      const now = new Date().toISOString();
      const insertData = { ...DEFAULTS, updated_at: now };
      const { data: created, error: insertErr } = await supabase
        .from(TABLE)
        .upsert(insertData, { onConflict: "id" })
        .select()
        .single();
      if (insertErr) throw insertErr;
      return res.json(created);
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const allowed = [
      "email_notifications", "auto_backup", "maintenance_mode",
      "allow_student_registration", "require_password_change",
      "session_timeout", "max_login_attempts", "default_role",
      "fine_per_day", "fine_restriction_threshold",
    ];
    const updates = { id: DOC_ID };
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    updates.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .upsert(updates, { onConflict: "id" });
    if (error) throw error;

    const { data, error: fetchErr } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", DOC_ID)
      .single();
    if (fetchErr) throw fetchErr;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getSettings, updateSettings };
