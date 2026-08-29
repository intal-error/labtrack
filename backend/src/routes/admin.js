const router = require("express").Router();
const { getAll, getActiveAdmins, create, update, toggleStatus, remove } = require("../controllers/adminController");
const { validate, adminCreateSchema } = require("../middleware/validate");

router.get("/", getAll);
router.get("/active", getActiveAdmins);
router.post("/", validate(adminCreateSchema), create);
router.put("/:id", update);
router.put("/:id/toggle-status", toggleStatus);
router.delete("/:id", remove);

module.exports = router;
