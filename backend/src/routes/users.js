const router = require("express").Router();
const { authorize, verifyToken } = require("../middleware/auth");
const { search, resolveCode } = require("../controllers/userController");

router.get("/search", authorize("admin"), search);

// Any signed-in user: a student scans their own ID at the equipment scanner.
// Kept off the admin-only path on purpose -- authorize("admin") would have
// locked students out of scanning their own equipment.
router.get("/resolve", verifyToken, resolveCode);

module.exports = router;
