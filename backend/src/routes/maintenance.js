const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, create, update, remove } = require("../controllers/maintenanceController");

router.get("/", getAll);
router.post("/", authorize("admin"), create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
