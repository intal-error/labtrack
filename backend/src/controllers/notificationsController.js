const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

const getAll = async (req, res) => {
  try {
    const userId = req.user.uid;

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let filtered = (notifications || []).filter(
      (n) => !(n.dismissed_by || []).includes(userId)
    );

    if (req.query.unreadOnly === "true") {
      filtered = filtered.filter((n) => !n.read);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(transformKeys(filtered), filtered.length, page, limit));
    }
    res.json(transformKeys(filtered));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { targetUserId, type, title, message, link } = req.body;
    if (!targetUserId || !type || !title || !message) {
      return res.status(400).json({ error: "targetUserId, type, title, and message are required" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        id: randomUUID(),
        target_user_id: targetUserId,
        type,
        title,
        message,
        link: link || "",
        read: false,
        dismissed_by: [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ id: data.id, message: "Notification created" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    const { data: doc, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (doc.target_user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to mark this notification" });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    const userId = req.user.uid;

    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("target_user_id", userId)
      .eq("read", false);

    if (error) throw error;
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const dismiss = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    const { data: doc, error: fetchError } = await supabase
      .from("notifications")
      .select("dismissed_by")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const current = doc.dismissed_by || [];
    if (!current.includes(userId)) {
      const { error } = await supabase
        .from("notifications")
        .update({ dismissed_by: [...current, userId] })
        .eq("id", id);

      if (error) throw error;
    }

    res.json({ message: "Notification dismissed" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, create, markRead, markAllRead, dismiss };
