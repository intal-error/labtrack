const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAllFines, getMyFines, checkRestriction, payFine, waiveFine } = require("../controllers/finesController");

router.get("/", authorize("admin", "faculty"), getAllFines);
router.get("/my", getMyFines);
router.get("/check-restriction/:userId", checkRestriction);
router.put("/:id/pay", authorize("admin"), payFine);
router.put("/:id/waive", authorize("admin"), waiveFine);

module.exports = router;
