const router = require("express").Router();
const { upload, uploadImage, uploadDocument } = require("../controllers/uploadController");
const { generateQR } = require("../controllers/qrController");

router.post("/image", upload.single("file"), uploadImage);
router.post("/document", upload.single("file"), uploadDocument);
router.post("/qr", generateQR);

module.exports = router;
