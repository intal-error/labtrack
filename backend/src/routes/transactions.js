const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn, getRecentActivity } = require("../controllers/transactionController");

router.get("/borrowed", authorize("admin"), getBorrowed);
router.get("/returned", authorize("admin"), getReturned);
router.get("/recent-activity", authorize("admin"), getRecentActivity);
router.get("/my-borrowed", getMyBorrowed);
router.get("/my-returned", getMyReturned);
router.get("/counts", authorize("admin"), getDashboardCounts);
router.get("/chart", authorize("admin"), getChartData);
router.post("/borrow", authorize("admin"), recordBorrow);
router.post("/return", authorize("admin"), recordReturn);

module.exports = router;
