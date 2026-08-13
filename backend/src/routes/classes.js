const router = require("express").Router();
const { getAll } = require("../controllers/classesController");

router.get("/", getAll);

module.exports = router;
