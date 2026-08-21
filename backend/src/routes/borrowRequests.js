const router = require("express").Router();
const { getAllRequests, getMyRequests, createRequest, approveRequest, rejectRequest, cancelRequest } = require("../controllers/borrowRequestController");

router.get("/", getAllRequests);
router.get("/my", getMyRequests);
router.post("/", createRequest);
router.put("/:id/approve", approveRequest);
router.put("/:id/reject", rejectRequest);
router.put("/:id/cancel", cancelRequest);

module.exports = router;
