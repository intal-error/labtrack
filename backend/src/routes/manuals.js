const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, create, update, remove } = require("../controllers/manualController");

router.get("/", getAll);
router.post("/", authorize("admin", "faculty"), create);
router.put("/:id", authorize("admin", "faculty"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
