const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, getMyIncidents, create, update, remove } = require("../controllers/incidentController");

router.get("/", getAll);
router.get("/mine", getMyIncidents);
router.post("/", create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
