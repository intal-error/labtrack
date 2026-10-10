const router = require("express").Router();
const { getCourses, createCourse, updateCourse, deleteCourse } = require("../controllers/coursesController");
const { requireSuperAdmin } = require("../middleware/courseScope");

// Mounted as verifyToken -> authorize("admin") -> attachCourseScope in server.js.
// Reads are open to any admin (the pickers need them); writes are the Super Admin's,
// because `courses.id` is the join key for every course-scoped table.

router.get("/", getCourses);
router.post("/", requireSuperAdmin, createCourse);
router.put("/:id", requireSuperAdmin, updateCourse);
router.delete("/:id", requireSuperAdmin, deleteCourse);

module.exports = router;