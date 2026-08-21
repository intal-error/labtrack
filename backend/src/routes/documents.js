const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, deleteDocument } = require("../controllers/documentsController");

router.get("/", getAll);
router.delete("/:id", authorize("admin"), deleteDocument);

module.exports = router;
