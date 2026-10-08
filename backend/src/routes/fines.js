const router = require("express").Router();
const { attachRole, authorize } = require("../middleware/auth");
const { invalidateFeature } = require("../utils/cache");
const { getAllFines, getMyFines, checkRestriction, getOverdueCount, payFine, waiveFine } = require("../controllers/finesController");

// Paying or waiving a fine must clear the cached list, or the admin's own action
// appears not to have taken effect for up to 15 seconds.
const CLEAR = invalidateFeature("/api/fines");

router.get("/", authorize("admin"), getAllFines);
router.get("/my", getMyFines);
router.get("/overdue-count", getOverdueCount);
router.get("/check-restriction/:userId", attachRole, (req, res, next) => {
  if (req.user.uid !== req.params.userId && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}, checkRestriction);
router.put("/:id/pay", authorize("admin"), CLEAR, payFine);
router.put("/:id/waive", authorize("admin"), CLEAR, waiveFine);

module.exports = router;
