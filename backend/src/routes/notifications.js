const router = require("express").Router();
const { getAll, getByUser, create, markRead, markAllRead, dismiss } = require("../controllers/notificationsController");

router.get("/", getAll);
router.get("/user", getByUser);
router.post("/", create);
router.put("/read-all", markAllRead);
router.put("/:id/read", markRead);
router.delete("/:id", dismiss);

module.exports = router;
