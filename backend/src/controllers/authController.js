const { db, auth } = require("../config/firebase");

const register = async (req, res) => {
  try {
    const {
      role, email, password, firstName, lastName,
      schoolId, course, year, section,
      employeeId, department, position,
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
    res.status(500).json({ error: err.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { register, getProfile, updateProfile, changePassword };
