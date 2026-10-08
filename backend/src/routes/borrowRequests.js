const router = require("express").Router();
const { authorize, attachRole } = require("../middleware/auth");
const { invalidateFeature } = require("../utils/cache");
const { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest, reassignRequest } = require("../controllers/borrowRequestController");
const { validate, borrowRequestSchema } = require("../middleware/validate");

// cacheMiddleware(15) is mounted on /api/borrow-requests in server.js. Approving a
// request also decrements the catalog item's available_quantity, so the catalog
// prefix has to go too -- a stale availability count would let the next student be
// approved for stock that is already spoken for.
const CLEAR = invalidateFeature("/api/borrow-requests");
const CLEAR_CATALOG = invalidateFeature("/api/catalog");

router.get("/", authorize("admin"), getAllRequests);
router.get("/my", getMyRequests);
// attachRole, not authorize: a student files their own request, but the
// controller needs their document for their school id, name and course.
router.post("/", attachRole, CLEAR, validate(borrowRequestSchema), createRequest);
router.put("/:id/approve", authorize("admin"), CLEAR, CLEAR_CATALOG, approveRequest);
router.put("/:id/reject", authorize("admin"), CLEAR, rejectRequest);
router.put("/:id/cancel", CLEAR, cancelRequest);
router.put("/:id/reassign", authorize("admin"), CLEAR, reassignRequest);

module.exports = router;
