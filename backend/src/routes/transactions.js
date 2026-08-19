const router = require("express").Router();
const { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn, getRecentActivity } = require("../controllers/transactionController");

router.get("/borrowed", getBorrowed);
router.get("/returned", getReturned);
router.get("/recent-activity", getRecentActivity);
router.get("/my-borrowed", getMyBorrowed);
router.get("/my-returned", getMyReturned);
router.get("/counts", getDashboardCounts);
router.get("/chart", getChartData);
router.post("/borrow", recordBorrow);
router.post("/return", recordReturn);

module.exports = router;
