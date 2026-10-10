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

    // WHY target_user_id IS NOW SELECTED: it was not, so this handler had no way to
    // tell WHOSE notification it was about to mutate. Any authenticated user could
    // dismiss anyone's notification.
    //
    // The blast radius is smaller than it first looks, and worth being precise about
    // rather than overselling: `dismissed_by` is a per-viewer array, and the read
    // path filters `!(n.dismissed_by || []).includes(userId)` for the CURRENT caller.
    // So appending your own uid to someone else's row only ever hides it from YOU --
    // it does not hide it from them. It was an unauthorized write to another user's
    // record, not a way to suppress someone else's notifications.
    //
    // What it does still enable: writing to rows you do not own, and inflating
    // dismissed_by with your uid against records you were never sent.
    const { data: doc, error: fetchError } = await supabase
      .from("notifications")
      .select("target_user_id, dismissed_by")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (doc.target_user_id !== userId) {
      // 404 rather than 403: a 403 would confirm the notification exists and is
      // addressed to somebody, which is itself a small disclosure.
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
