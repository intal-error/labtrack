const router = require("express").Router();
const multer = require("multer");
const { authorize, attachRole } = require("../middleware/auth");
const {
  getAll,
  getRule,
  create,
  update,
  remove,
  uploadFile,
  downloadFile,
} = require("../controllers/safetyRuleController");

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// memoryStorage, matching uploadController: the buffer is sniffed by magic bytes and then
// forwarded to Cloudinary, so it never needs to touch disk.
//
// The fileFilter here is a CHEAP FIRST PASS only. It cannot be the security boundary --
// the declared Content-Type is chosen by the client and is trivially spoofed -- so it
// rejects the obviously wrong early and the authoritative check is identifyFile() over
// the actual bytes inside uploadFile. Keeping both means an oversized or absurd file is
// never buffered, while correctness still rests on content.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const plausible = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    if (plausible.includes(String(file.mimetype).toLowerCase())) return cb(null, true);
    const err = new Error(`File type not allowed: ${file.mimetype}`);
    err.status = 400;
    err.expose = true;
    cb(err);
  },
});

// --- reads ---------------------------------------------------------------
// attachRole, not authorize: students are legitimate readers here (their own course's
// rules), and attachRole is what resolves req.profile -- which safetyRuleScope needs.
// Without it the scope helper would see no profile and fall closed for EVERYONE.
router.get("/", attachRole, getAll);
router.get("/:id", attachRole, getRule);

// --- file delivery -------------------------------------------------------
// Same course check as the record, performed on every request. Nothing here trusts the
// client to have already been authorised, so a guessed id is not a way in.
router.get("/:id/file", attachRole, downloadFile);

// --- writes --------------------------------------------------------------
// Admin-only. The course restriction is enforced inside the handlers, because it depends
// on WHICH course is being written rather than on the caller's role alone.
router.post("/", authorize("admin"), create);
router.put("/:id", authorize("admin"), update);
router.delete("/:id", authorize("admin"), remove);
router.post("/upload", authorize("admin"), upload.single("file"), uploadFile);

module.exports = router;