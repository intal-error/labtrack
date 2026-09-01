const router = require("express").Router();
const { borrowedReport, returnedReport, catalogReport } = require("../controllers/reportController");
const { getSummary } = require("../controllers/reportSummaryController");

router.get("/summary", getSummary);
router.get("/borrowed", borrowedReport);
router.get("/returned", returnedReport);
router.get("/catalog", catalogReport);

module.exports = router;
