const router = require("express").Router();
const { getAll } = require("../controllers/documentsController");

router.get("/", getAll);

module.exports = router;
