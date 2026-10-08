const router = require("express").Router();
const { invalidateFeature } = require("../utils/cache");
const { getSettings, updateSettings } = require("../controllers/settingsController");

// The fine rate and restriction threshold live in settings, and the fine-per-day
// figure is read on every overdue computation. Serving a 60s-stale settings object
// after a save means the new rate is silently ignored.
router.get("/", getSettings);
router.put("/", invalidateFeature("/api/settings"), updateSettings);

module.exports = router;
