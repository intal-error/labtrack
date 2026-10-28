const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { attachCourseScope } = require("../middleware/courseScope");
const { borrowedReport, returnedReport, catalogReport } = require("../controllers/reportController");
const { getSummary } = require("../controllers/reportSummaryController");
const { downloadPersonaReport } = require("../controllers/personaController");

router.get("/summary", getSummary);
router.get("/borrowed", borrowedReport);
router.get("/returned", returnedReport);
router.get("/catalog", catalogReport);
router.get("/persona/:id", authorize("admin"), attachCourseScope, downloadPersonaReport);

module.exports = router;
