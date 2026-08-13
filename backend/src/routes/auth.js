const router = require("express").Router();
const { register, getProfile } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

router.post("/register", register);
router.get("/profile", verifyToken, getProfile);

module.exports = router;
