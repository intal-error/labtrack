const router = require("express").Router();
const { authorize, verifyToken } = require("../middleware/auth");
const { attachCourseScope } = require("../middleware/courseScope");
const { search, resolveCode, listStudents } = require("../controllers/userController");
const { getPersona } = require("../controllers/personaController");

router.get("/search", authorize("admin"), search);

// Paginated student roster. attachCourseScope runs after authorize("admin"), so
// req.profile is populated and the handler can read the caller's course without
// another Firestore read. The ?course= filter is a SUPER ADMIN convenience; a
// Course Admin's own course wins.
router.get("/", verifyToken, authorize("admin"), attachCourseScope, listStudents);

// Any signed-in user: a student scans their own ID at the equipment scanner.
// Kept off the admin-only path on purpose -- authorize("admin") would have
// locked students out of scanning their own equipment.
router.get("/resolve", verifyToken, resolveCode);

// Super Admin / scoped Course Admin: full profile + records for a person.
router.get("/:id/persona", authorize("admin"), attachCourseScope, getPersona);

module.exports = router;
