const router = require("express").Router();
const { register, getProfile, updateProfile, changePassword } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

router.post("/register", register);
router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);
router.put("/password", verifyToken, changePassword);

module.exports = router;
