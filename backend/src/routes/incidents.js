const router = require("express").Router();
const { getAll, getMyIncidents, create, update } = require("../controllers/incidentController");

router.get("/", getAll);
router.get("/mine", getMyIncidents);
router.post("/", create);
router.put("/:id", update);

module.exports = router;
