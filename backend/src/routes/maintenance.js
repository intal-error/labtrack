const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { invalidateFeature } = require("../utils/cache");
const { getAll, create, update, remove } = require("../controllers/maintenanceController");

const CLEAR = invalidateFeature("/api/maintenance");

router.get("/", getAll);
router.post("/", authorize("admin"), CLEAR, create);
router.put("/:id", authorize("admin"), CLEAR, update);
router.delete("/:id", authorize("admin"), CLEAR, remove);

module.exports = router;
