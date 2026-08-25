const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { courseFilter } = require("../middleware/courseFilter");
const {
  createActivity, getActivities, getMyActivities, getActivityById,
  updateActivity, deleteActivity, joinSession,
  getSessionAttendees, getSessionNonAttendees, markAbsent,
} = require("../controllers/labActivityController");

router.get("/", authorize("admin"), courseFilter, getActivities);
router.get("/student", getMyActivities);
router.get("/:id", getActivityById);
router.post("/", authorize("admin"), createActivity);
router.put("/:id", authorize("admin"), updateActivity);
router.delete("/:id", authorize("admin"), deleteActivity);
router.post("/:id/join", joinSession);
router.get("/:id/attendees", authorize("admin"), courseFilter, getSessionAttendees);
router.get("/:id/non-attendees", authorize("admin"), getSessionNonAttendees);
router.put("/:id/attendees/:attendeeId", authorize("admin"), markAbsent);

module.exports = router;
