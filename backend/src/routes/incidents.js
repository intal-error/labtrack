const router = require("express").Router();
const { getAll, getMyIncidents, create, update, remove } = require("../controllers/incidentController");

router.get("/", getAll);
router.get("/mine", getMyIncidents);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;
