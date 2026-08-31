const { db } = require("../config/firebase");

const USERS = "users";

const search = async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const snap = await db.collection(USERS).get();
    const queryFirst = firstName.trim().toLowerCase();
    const queryLast = lastName.trim().toLowerCase();

    const matched = snap.docs.filter((doc) => {
      const u = doc.data();
      const f = String(u.firstName || "").trim().toLowerCase();
      const l = String(u.lastName || "").trim().toLowerCase();
      return f.includes(queryFirst) && l.includes(queryLast);
    });

    if (matched.length === 0) return res.status(404).json({ error: "No person found" });

    const userDoc = matched[0];
    const u = userDoc.data();

    const [borrowedSnap, returnedSnap] = await Promise.all([
      db.collection(USERS).doc(userDoc.id).collection("borrowed").get(),
      db.collection(USERS).doc(userDoc.id).collection("returned").get(),
    ]);

    const borrowed = borrowedSnap.docs.map((d) => d.data()).filter((d) => d.status === "borrowed");
    const returned = returnedSnap.docs.map((d) => d.data()).filter((d) => d.status === "returned");

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
