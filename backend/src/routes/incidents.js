const router = require("express").Router();
const { attachRole, authorize } = require("../middleware/auth");
const { getAll, getMyIncidents, create, update, remove } = require("../controllers/incidentController");

router.get("/", attachRole, getAll);
router.get("/mine", getMyIncidents);
router.post("/", create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
