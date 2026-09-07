const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAll, getById, create, update, remove, lookupByBarcode } = require("../controllers/catalogController");
const { validate, catalogCreateSchema } = require("../middleware/validate");

router.get("/lookup/barcode/:code", lookupByBarcode);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", authorize("admin"), validate(catalogCreateSchema), create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;
