const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAllFines, getMyFines, checkRestriction, payFine, waiveFine } = require("../controllers/finesController");

router.get("/", authorize("admin"), getAllFines);
router.get("/my", getMyFines);
router.get("/check-restriction/:userId", (req, res, next) => {
  if (req.user.uid !== req.params.userId && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}, checkRestriction);
router.put("/:id/pay", authorize("admin"), payFine);
router.put("/:id/waive", authorize("admin"), waiveFine);

module.exports = router;
