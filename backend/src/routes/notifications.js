const router = require("express").Router();
const { getAll, dismiss } = require("../controllers/notificationsController");

router.get("/", getAll);
router.delete("/:id", dismiss);

module.exports = router;
