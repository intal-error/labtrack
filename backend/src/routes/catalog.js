const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { invalidateFeature } = require("../utils/cache");
const { getAll, getStats, getOptions, getById, create, update, remove, lookupByBarcode } = require("../controllers/catalogController");
const { validate, catalogCreateSchema } = require("../middleware/validate");

// cacheMiddleware(30) is mounted on /api/catalog in server.js, so every write here
// must clear it -- otherwise the list the admin sees for the next 30 seconds is the
// one that existed before they saved.
const CLEAR = invalidateFeature("/api/catalog");

router.get("/lookup/barcode/:code", lookupByBarcode);
router.get("/stats", getStats);
// Before /:id so "options" is not parsed as an id.
router.get("/options", getOptions);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", authorize("admin"), CLEAR, validate(catalogCreateSchema), create);
router.put("/:id", authorize("admin"), CLEAR, update);
router.delete("/:id", authorize("admin"), CLEAR, remove);

module.exports = router;
