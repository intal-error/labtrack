const router = require("express").Router();
const { register, getProfile, updateProfile, changePassword } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const { validate, registerSchema } = require("../middleware/validate");

router.post("/register", validate(registerSchema), register);
router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);
router.put("/password", verifyToken, changePassword);

module.exports = router;
