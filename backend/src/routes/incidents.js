const router = require("express").Router();
const { attachRole, authorize } = require("../middleware/auth");
const { invalidateFeature } = require("../utils/cache");
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
//
// cacheMiddleware(15) is mounted on /api/incidents in server.js. Every write has to
// clear it: the status a handler just set was invisible to the queue behind them for
// the rest of the TTL, which reads as "the save didn't work" and invites a re-submit.
const CLEAR = invalidateFeature("/api/incidents");

router.get("/", attachRole, getAll);
router.get("/mine", getMine);
// attachRole is REQUIRED here, not optional. getOne reads req.profile for its
// admin branch, and this route previously carried no role middleware at all -- only
// the mount-level verifyToken -- so req.profile was undefined for every caller and
// every admin request for a report detail 403'd at canHandleIncident({}).
//
// attachRole (not authorize) because a STUDENT must also be able to open their own
// report; the controller enforces `reported_by === req.user.uid` for that branch.
router.get("/:id", attachRole, getOne);
// attachRole (not authorize): filing a report is a student action, but the
// controller needs the reporter's own document to read their course for handler
// assignment. It used to fetch that document itself, which was fine until the
// other admin routes proved they could reuse the middleware's copy instead.
router.post("/", attachRole, CLEAR, validate(incidentCreateSchema), create);
router.put("/:id/status", authorize("admin"), CLEAR, updateStatus);
router.put("/:id/remark", authorize("admin"), CLEAR, addRemark);
router.put("/:id/reassign", authorize("admin"), CLEAR, reassign);
router.delete("/:id", authorize("admin"), CLEAR, remove);

module.exports = router;