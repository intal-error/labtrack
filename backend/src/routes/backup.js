const router = require("express").Router();
const { exportBackup, downloadBackup, importBackup, getBackupHistory } = require("../controllers/backupController");

router.post("/export", exportBackup);
router.get("/download", downloadBackup);
router.post("/import", importBackup);
router.get("/history", getBackupHistory);

module.exports = router;
