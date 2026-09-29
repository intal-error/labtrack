const { auth, db } = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const token = header.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

async function resolveRole(req) {
  if (!req.user?.uid) return null;

  const userDoc = await db.collection("users").doc(req.user.uid).get();
  if (userDoc.exists) return userDoc.data().role;

  const adminDoc = await db.collection("admins").doc(req.user.uid).get();
  if (adminDoc.exists) return "admin";

  return null;
}

const attachRole = async (req, res, next) => {
  try {
    if (req.user?.uid && !req.user.role) {
      req.user.role = await resolveRole(req);
    }
    next();
  } catch (err) {
    console.error("Failed to look up user role:", err.message);
    res.status(403).json({ error: "Unable to verify permissions" });
  }
};

const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user?.role && req.user?.uid) {
      try {
        req.user.role = await resolveRole(req);
      } catch (err) {
        console.error("Failed to look up user role:", err.message);
        return res.status(403).json({ error: "Unable to verify permissions" });
      }
    }

    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

const errorHandler = (err, req, res, _next) => {
  console.error("Server error:", err);
  const isDev = process.env.NODE_ENV === "development";
  res.status(err.status || 500).json({
    error: isDev ? (err.message || "Internal server error") : "Internal server error",
  });
};

module.exports = { verifyToken, attachRole, authorize, errorHandler };
