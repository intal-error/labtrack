const router = require("express").Router();
const { getAll, deleteDocument } = require("../controllers/documentsController");

router.get("/", getAll);
router.delete("/:id", deleteDocument);

module.exports = router;
