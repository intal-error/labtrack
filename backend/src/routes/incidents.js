const router = require("express").Router();
const { attachRole, authorize } = require("../middleware/auth");
const { validate, incidentCreateSchema } = require("../middleware/validate");
const {
  getAll,
  getMine,
  getOne,
  create,
  updateStatus,
  addRemark,
  reassign,
  remove,
} = require("../controllers/incidentController");

// One verb per intent, mirroring borrowRequests.js. The course check itself
// lives in the controller (canHandleIncident) because it needs the report row,
// but role gating is declared here.
router.get("/", attachRole, getAll);
router.get("/mine", getMine);
router.get("/:id", getOne);
router.post("/", validate(incidentCreateSchema), create);
router.put("/:id/status", authorize("admin"), updateStatus);
router.put("/:id/remark", authorize("admin"), addRemark);
router.put("/:id/reassign", authorize("admin"), reassign);
router.delete("/:id", authorize("admin"), remove);

module.exports = router;