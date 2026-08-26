const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, getByUser, create, markRead, markAllRead, dismiss } = require("../controllers/notificationsController");

router.get("/", getAll);
router.get("/user", getByUser);
router.post("/", authorize("admin"), create);
router.put("/read-all", markAllRead);
router.put("/:id/read", markRead);
router.delete("/:id", dismiss);

module.exports = router;
