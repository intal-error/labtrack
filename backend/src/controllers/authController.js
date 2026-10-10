const { db, auth } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { isSuperAdmin } = require("../middleware/courseScope");

/**
 * Resolves the caller's own Firestore document, and decides where they go.
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
 *
 * WHY IT NOW ALSO CARRIES THE ROUTING DECISION: there is no role picker on the
 * login page any more, so the backend is the only thing that can say which
 * dashboard a signed-in user belongs on. It also returns the caller's course, so
 * the client can label itself ("CT Dashboard") without a second request.
 *
 * `landingPath` is deliberately the ONLY navigation hint. The client follows it
 * rather than re-deriving a route from the role string, which is how the client
 * and the server end up disagreeing about where someone should be.
 */
const getProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    let profile;
    if (userDoc.exists) {
      profile = { id: userDoc.id, ...userDoc.data() };
    } else {
      const adminDoc = await db.collection("admins").doc(uid).get();
      if (!adminDoc.exists) {
        return res.status(404).json({ error: "User profile not found" });
      }
      // role first, for the same reason resolveProfile does: a stored role must not
      // override the forced "admin".
      profile = { id: adminDoc.id, role: "admin", ...adminDoc.data() };
    }

    const role = (profile.role || "").toLowerCase();

    // courseName costs one indexed primary-key lookup and only for an admin, so it
    // is resolved here rather than shipped as a code the client would have to map.
    // A course id that matches no row yields an empty name rather than failing the
    // whole profile: the caller is still authenticated, and a missing label must not
    // strand them on the login page.
    let courseName = "";
    if (profile.courseId) {
      const { data } = await supabase
        .from("courses")
        .select("name")
        .eq("id", profile.courseId)
        .limit(1);
      courseName = (data && data[0] && data[0].name) || "";
    }

    res.json({
      ...profile,
      // Normalised for the client. adminLevel is absent on a pre-migration admin,
      // which courseScope treats as unrestricted -- see middleware/courseScope.js.
      adminLevel: profile.adminLevel || "",
      courseId: profile.courseId || null,
      courseName,
      isSuperAdmin: isSuperAdmin(profile),
      // THREE roles, THREE landings. The kiosk branch is NOT optional: without it a
      // kiosk account falls to `/dashboard`, which renders StudentDashboard for a
      // profile with no schoolId, and the operator is stranded in a broken page with
      // no route back to /attend/kiosk. App.jsx's LandingRedirect deliberately
      // refuses to re-derive this from the role (two navigators racing is how you get
      // bounced back to /login), so the backend is the only place it can be decided.
      landingPath:
        role === "kiosk" ? "/attend/kiosk"
        : role === "student" ? "/my-activity"
        : "/dashboard",
    });
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
