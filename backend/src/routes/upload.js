const router = require("express").Router();
const { upload, uploadImage, uploadDocument, uploadConditionPhoto } = require("../controllers/uploadController");
const { generateQR } = require("../controllers/qrController");
const { qrLimiter } = require("../middleware/rateLimits");

router.post("/image", upload.single("file"), uploadImage);
router.post("/document", upload.single("file"), uploadDocument);
router.post("/condition-photo", upload.single("file"), uploadConditionPhoto);

// qrLimiter, not uploadLimiter and not generalLimiter: this endpoint uploads
// nothing (it is a local QRCode.toDataURL call) so it must not spend one of the
// 15/hour photo-upload slots — but it must not draw on generalLimiter either,
// which every read endpoint shares via methodAwareLimiter. middleware/
// rateLimits.js documents the three arrangements already tried and why this one.
router.post("/qr", qrLimiter, generateQR);

module.exports = router;
