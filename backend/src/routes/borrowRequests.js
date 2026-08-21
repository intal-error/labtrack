const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest } = require("../controllers/borrowRequestController");

router.get("/", authorize("admin", "faculty"), getAllRequests);
router.get("/my", getMyRequests);
router.post("/", createRequest);
router.put("/:id/approve", authorize("admin", "faculty"), approveRequest);
router.put("/:id/reject", authorize("admin", "faculty"), rejectRequest);
router.put("/:id/cancel", cancelRequest);

module.exports = router;
