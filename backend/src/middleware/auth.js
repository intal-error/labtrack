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
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    let role = req.user?.role;

    if (!role && req.user?.uid) {
      try {
        const userDoc = await db.collection("users").doc(req.user.uid).get();
        if (userDoc.exists) {
          role = userDoc.data().role;
        } else {
          const adminDoc = await db.collection("admins").doc(req.user.uid).get();
          if (adminDoc.exists) {
            role = "admin";
          }
        }
        if (role) req.user.role = role;
      } catch (err) {
        console.error("Failed to look up user role:", err.message);
      }
    }

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

const errorHandler = (err, req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
};

module.exports = { verifyToken, authorize, errorHandler };
