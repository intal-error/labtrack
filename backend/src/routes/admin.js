const router = require("express").Router();
const { getAll, getActiveAdmins, create, update, toggleStatus, remove } = require("../controllers/adminController");
const { validate, adminCreateSchema } = require("../middleware/validate");
const { requireSuperAdmin } = require("../middleware/courseScope");

// Mounted as verifyToken -> authorize("admin") -> attachCourseScope in server.js,
// so req.profile is populated and requireSuperAdmin can make its decision here.

router.get("/", getAll);
router.get("/active", getActiveAdmins);

// Course Admin creation is the Super Admin's alone. See adminController.create
// for why the Super Admin cannot itself be created here.
router.post("/", requireSuperAdmin, validate(adminCreateSchema), create);

// Self-service only: update() refuses any other target, and refuses the Super
// Admin outright. A Course Admin editing their own name/contact is unaffected;
// changing courseId additionally requires adminLevel === "super".
router.put("/:id", update);
router.put("/:id/toggle-status", toggleStatus);
router.delete("/:id", remove);

module.exports = router;