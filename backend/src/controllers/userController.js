const { db } = require("../config/firebase");

const USERS = "users";

const search = async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const snap = await db.collection(USERS)
      .where("firstName", "==", firstName.trim())
      .where("lastName", "==", lastName.trim())
      .get();

    if (snap.empty) return res.status(404).json({ error: "No person found" });

    const userDoc = snap.docs[0];
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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { search };
