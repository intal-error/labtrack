const router = require("express").Router();
const { search } = require("../controllers/userController");

router.get("/search", search);

module.exports = router;
