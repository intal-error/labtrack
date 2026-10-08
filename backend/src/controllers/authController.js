const { db, auth } = require("../config/firebase");

/**
 * Resolves the caller's own Firestore document.
 *
 * WHY NOT firebase/firestore ON THE CLIENT: AuthContext.jsx used to do this
 * exact two-collection lookup with getDoc(), and because the client imported
 * `firebase/firestore` to do it, the build shipped the ENTIRE Firestore SDK --
 * WebChannel streaming, offline persistence, the query engine, an inlined
 * `idb` helper -- in the eagerly-loaded entry chunk. Measured at 215 kB of a
 * 562 kB entry bundle, re-downloaded on every app-code deploy, to perform two
 * single-document reads.
 *
 * The server already performs this same lookup on every authenticated request
 * (middleware/auth.js resolveProfile) to decide what the caller may do. So the
 * lookup happens either way; doing it here and shipping the answer costs one
 * extra response but removes 215 kB from the critical path.
 *
 * Falls back to the `admins` collection exactly as resolveProfile does, because
 * this used to 404 for every admin, whose documents live there.
 */
const getProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      return res.json({ id: userDoc.id, ...userDoc.data() });
    }

    const adminDoc = await db.collection("admins").doc(uid).get();
    if (adminDoc.exists) {
      return res.json({ id: adminDoc.id, role: "admin", ...adminDoc.data() });
    }

    return res.status(404).json({ error: "User profile not found" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const register = async (req, res) => {
  try {
    const {
      role, email, password, firstName, lastName,
      schoolId, course, year, section,
      contact,
    } = req.body;

    if (!role || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    if (role !== "student") {
      return res.status(400).json({ error: "Invalid role. Must be student." });
    }

    if (!schoolId) {
      return res.status(400).json({ error: "School ID is required for students" });
    }

    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
      });
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        return res.status(409).json({ error: "This email is already registered" });
      }
      if (err.code === "auth/invalid-email") {
        return res.status(400).json({ error: "Invalid email address" });
      }
      if (err.code === "auth/weak-password") {
        return res.status(400).json({ error: "Password is too weak (min 6 characters)" });
      }
      throw err;
    }

    // Set custom claims (non-critical — registration still succeeds if this fails)
    try {
      await auth.setCustomUserClaims(userRecord.uid, { role });
    } catch (claimErr) {
      console.warn("Failed to set custom claims (non-critical):", claimErr.message);
    }

    const userData = {
      role,
      firstName,
      lastName,
      email,
      contact: contact || "",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (role === "student") {
      userData.schoolId = schoolId;
      userData.course = course || "";
      userData.year = year || "";
      userData.section = section || "";
    }

    await db.collection("users").doc(userRecord.uid).set(userData);

    res.status(201).json({ id: userRecord.uid, message: "Registration successful" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { firstName, lastName, contact, profileURL } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }

    const updates = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      contact: (contact || "").trim(),
      ...(profileURL !== undefined && { profileURL }),
      updatedAt: new Date(),
    };

    await db.collection("users").doc(uid).set(updates, { merge: true });

    try {
      await auth.updateUser(uid, { displayName: `${firstName.trim()} ${lastName.trim()}` });
    } catch {
      // Non-critical: Firebase Auth display name update failed
    }

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one uppercase letter" });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one lowercase letter" });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one number" });
    }

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const email = userDoc.data().email;
    if (!email) {
      return res.status(400).json({ error: "No email associated with this account" });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server configuration error: missing Firebase API key" });
    }

    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: currentPassword, returnSecureToken: false }),
      }
    );
    const verifyResult = await verifyRes.json();
    if (verifyResult.error) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    await auth.updateUser(uid, { password: newPassword });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { register, getProfile, updateProfile, changePassword };
