const router = require("express").Router();
const { upload, uploadImage, uploadDocument, uploadConditionPhoto } = require("../controllers/uploadController");
const { generateQR } = require("../controllers/qrController");

router.post("/image", upload.single("file"), uploadImage);
router.post("/document", upload.single("file"), uploadDocument);
router.post("/condition-photo", upload.single("file"), uploadConditionPhoto);
router.post("/qr", generateQR);

module.exports = router;
