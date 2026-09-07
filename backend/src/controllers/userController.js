const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");

const USERS = "users";

const search = async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const queryFirst = firstName.trim();
    const queryLast = lastName.trim();

    const snap = await db.collection(USERS).get();
    const qFirst = queryFirst.toLowerCase();
    const qLast = queryLast.toLowerCase();
    const matched = snap.docs.filter((doc) => {
      const u = doc.data();
      return String(u.firstName || "").toLowerCase().includes(qFirst) &&
             String(u.lastName || "").toLowerCase().includes(qLast);
    });

    if (matched.length === 0) return res.status(404).json({ error: "No person found" });

    const userDoc = matched[0];
    const u = userDoc.data();

    const [borrowedResult, returnedResult] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userDoc.id).eq("action", "borrowed"),
      supabase.from("transactions").select("*").eq("user_id", userDoc.id).eq("action", "returned"),
    ]);

    const borrowed = (borrowedResult.data || []).filter((d) => d.status === "borrowed");
    const returned = (returnedResult.data || []).filter((d) => d.status === "returned");

    res.json({
      user: { id: userDoc.id, ...u },
      borrowed,
      returned,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { search };
