const { db } = require("../config/firebase");

/**
 * Middleware that attaches course+year filter info to req for admin users.
 * Admins only see data matching their assignedCourse + assignedYear.
 * Students see only their own data (handled at controller level).
 */
async function courseFilter(req, res, next) {
  try {
    const uid = req.user.uid;
    const role = req.user.role;

    if (role === "admin") {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        req.adminAssignment = {
          assignedCourse: data.assignedCourse || "",
          assignedYear: data.assignedYear || "",
        };
      } else {
        req.adminAssignment = { assignedCourse: "", assignedYear: "" };
      }
    }

    next();
  } catch (err) {
    console.error("courseFilter error:", err.message);
    next();
  }
}

module.exports = { courseFilter };
