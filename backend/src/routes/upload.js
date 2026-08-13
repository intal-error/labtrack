const router = require("express").Router();
const { upload, uploadImage } = require("../controllers/uploadController");
const { generateQR } = require("../controllers/qrController");

router.post("/image", upload.single("file"), uploadImage);
router.post("/qr", generateQR);

module.exports = router;
