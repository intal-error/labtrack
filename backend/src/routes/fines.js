const router = require("express").Router();
const { getAllFines, getMyFines, checkRestriction, payFine, waiveFine } = require("../controllers/finesController");

router.get("/", getAllFines);
router.get("/my", getMyFines);
router.get("/check-restriction/:userId", checkRestriction);
router.put("/:id/pay", payFine);
router.put("/:id/waive", waiveFine);

module.exports = router;
