const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest, reassignRequest } = require("../controllers/borrowRequestController");
const { validate, borrowRequestSchema } = require("../middleware/validate");

router.get("/", authorize("admin"), getAllRequests);
router.get("/my", getMyRequests);
router.post("/", validate(borrowRequestSchema), createRequest);
router.put("/:id/approve", authorize("admin"), approveRequest);
router.put("/:id/reject", authorize("admin"), rejectRequest);
router.put("/:id/cancel", cancelRequest);
router.put("/:id/reassign", authorize("admin"), reassignRequest);

module.exports = router;
