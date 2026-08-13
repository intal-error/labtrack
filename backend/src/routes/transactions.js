const router = require("express").Router();
const { getBorrowed, getReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn } = require("../controllers/transactionController");

router.get("/borrowed", getBorrowed);
router.get("/returned", getReturned);
router.get("/counts", getDashboardCounts);
router.get("/chart", getChartData);
router.post("/borrow", recordBorrow);
router.post("/return", recordReturn);

module.exports = router;
