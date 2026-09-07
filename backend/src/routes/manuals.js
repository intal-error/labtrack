const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, getManual, create, update, remove } = require("../controllers/manualController");

router.get("/", getAll);
router.get("/:id", getManual);
router.post("/", authorize("admin"), create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
