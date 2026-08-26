const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { search } = require("../controllers/userController");

router.get("/search", authorize("admin"), search);

module.exports = router;
