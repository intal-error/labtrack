const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { courseFilter } = require("../middleware/courseFilter");
const { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest } = require("../controllers/borrowRequestController");

router.get("/", authorize("admin"), courseFilter, getAllRequests);
router.get("/my", getMyRequests);
router.post("/", createRequest);
router.put("/:id/approve", authorize("admin"), courseFilter, approveRequest);
router.put("/:id/reject", authorize("admin"), courseFilter, rejectRequest);
router.put("/:id/cancel", cancelRequest);

module.exports = router;
