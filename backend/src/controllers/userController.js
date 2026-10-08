const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");

const USERS = "users";

// Mirrors the browser-side BorrowerLookup that this replaced.
//
// The old client loop tried, in order: the code as a document id, then equality
// against each of schoolId / employeeId / schoolID / studentID / barcode / qrCode,
// for up to two sanitised variants of the payload. That is up to thirteen
// Firestore round trips from the browser, and it only worked because the client
// shipped the Firestore SDK (215 kB of the entry chunk).
//
// Everything arrives here in one request as comma-separated candidate lists, so
// the worst case is one sequential pass of indexed lookups instead, and the
// Firestore SDK is off the client entirely.
//
// Deliberately NOT authorize("admin"): a student scans their own ID at the
// scanner, so this is any-signed-in-user. It reveals only the caller's own
// document, and only for code-derived lookups.
const resolveCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }

    const split = (value) =>
      typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const docIds = split(req.query.ids);
    const fieldCandidates = split(req.query.candidates);

    if (docIds.length === 0 && fieldCandidates.length === 0) {
      return res.status(400).json({ error: "no lookup candidates" });
    }

    // 1. Document-id match. Our own generated codes land here, so it goes first.
    for (const id of docIds) {
      if (!canUseAsDocId(id)) continue;
      const snap = await db.collection(USERS).doc(id).get();
      if (snap.exists) return res.json({ user: { id: snap.id, ...snap.data() } });
    }

    // 2. Field equality. Firestore serves these from its automatic indexes, and
    //    they run concurrently because none depends on another.
    const FIELDS = ["schoolId", "employeeId", "schoolID", "studentID", "barcode", "qrCode"];
    const lookups = [];
    for (const field of FIELDS) {
      for (const candidate of fieldCandidates) {
        lookups.push(
          db.collection(USERS).where(field, "==", candidate).limit(1).get()
            .then((snap) => ({ snap, field, candidate }))
            .catch((err) => {
              // One unavailable field must not abandon the whole lookup -- the old
              // client caught per-field for exactly this reason.
              console.warn(`resolveCode: query on field "${field}" failed:`, err.message);
              return null;
            })
        );
      }
    }

    const results = (await Promise.all(lookups)).filter(Boolean);
    const hit = results.find((r) => !r.snap.empty);
    if (hit) {
      const doc = hit.snap.docs[0];
      return res.json({ user: { id: doc.id, ...doc.data() } });
    }

    res.json({ user: null });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Same validation the client applied before calling canUseAsDocId.
function canUseAsDocId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[/\\]/.test(value);
}

const search = async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const queryFirst = firstName.trim().toLowerCase();
    const queryLast = lastName.trim().toLowerCase();

    // Use Firestore prefix range query instead of loading all users
    const firstSnap = await db
      .collection(USERS)
      .where("firstName", ">=", queryFirst)
      .where("firstName", "<=", queryFirst + "\uf8ff")
      .limit(20)
      .get();

    // Filter by lastName from the small result set
    const matched = firstSnap.docs.filter((doc) => {
      const u = doc.data();
      return String(u.lastName || "").toLowerCase().includes(queryLast);
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

module.exports = { search, resolveCode };
