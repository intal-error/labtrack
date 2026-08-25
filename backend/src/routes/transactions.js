const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { courseFilter } = require("../middleware/courseFilter");
const { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn, getRecentActivity } = require("../controllers/transactionController");

router.get("/borrowed", authorize("admin"), courseFilter, getBorrowed);
router.get("/returned", authorize("admin"), courseFilter, getReturned);
router.get("/recent-activity", authorize("admin"), courseFilter, getRecentActivity);
router.get("/my-borrowed", getMyBorrowed);
router.get("/my-returned", getMyReturned);
router.get("/counts", authorize("admin"), courseFilter, getDashboardCounts);
router.get("/chart", authorize("admin"), courseFilter, getChartData);
router.post("/borrow", recordBorrow);
router.post("/return", recordReturn);

module.exports = router;
