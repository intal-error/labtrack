const multer = require("multer");
const { supabase } = require("../config/supabase");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "image/png",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(`File type not allowed: ${file.mimetype}`);
      err.status = 400;
      err.expose = true;
      cb(err);
    }
  },
});

/**
 * Reads the Cloudinary upload credentials, refusing to guess when they are absent.
 *
 * WHY this guard exists: these were interpolated straight into the request URL
 * with no check, so a blank CLOUDINARY_CLOUD_NAME became the literal hostname
 * `api.cloudinary.com/v1_1/undefined/image/upload`. Cloudinary answered with a
 * generic error, secure_url was missing, and the client received "Upload
 * failed" — identical to a rejected file type, an oversized file or a spent
 * rate limit. The feature was broken in production while localhost worked,
 * because only backend/.env carried the values (render.yaml declares both as
 * `sync: false`) and nothing checked them at boot.
 *
 * `expose: true` is what lets this reach the client in production: the central
 * errorHandler only reveals err.message when it is set, when the failure is a
 * multer limit, or outside production.
 *
 * 503 rather than 500: the file is fine and the request is well-formed, the
 * server is simply missing configuration. It is also the status that makes the
 * failure legible in logs and to any uptime monitor watching /api/health.
 */
function requireCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();

  const missing = [];
  if (!cloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!preset) missing.push("CLOUDINARY_UPLOAD_PRESET");

  if (missing.length) {
    console.error(`[UPLOAD] Cloudinary is not configured: missing ${missing.join(", ")}`);
    const err = new Error(
      `Image storage is not configured on the server (missing ${missing.join(", ")}).`
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }

  return { cloudName, preset };
}

/**
 * Turns a Cloudinary rejection into an answer the user can act on.
 *
 * WHY: the response body already carried Cloudinary's own explanation
 * ("Invalid cloud name", "preset not found", "File size too large"), but it was
 * returned under a flat "Upload failed" and then discarded again by the client.
 * Every failure looked the same from the UI, which is what made this take a
 * full deploy cycle to track down. Surfacing the upstream message loses nothing
 * — it describes our own misconfiguration or a bad file, never a secret.
 */
function cloudinaryRejection(res, data) {
  const message = data?.error?.message || "Upload failed";
  console.error(`[UPLOAD] Cloudinary rejected the upload: ${message}`);
  return res.status(400).json({ error: message, details: data });
}

/**
 * Answers with `err.message` only when it is safe to reveal, mirroring the rule
 * in middleware/auth.js -> errorHandler.
 *
 * WHY this exists: these three handlers each caught their own errors and, until
 * this was centralised, reported any error carrying a `.status` verbatim —
 * bypassing the production sanitisation that errorHandler performs. Nothing
 * leaked at the time (the only such error was the guard above, which is
 * explicitly exposeable), but it left a second, weaker copy of a security
 * control one careless `throw` away from leaking an internal message. Keeping
 * the rule identical to errorHandler's is the point: if one changes, both must.
 */
function sendError(res, err) {
  const status = err.status || err.statusCode || 500;
  const safeToShow = process.env.NODE_ENV === "development" || err.expose === true;
  return res
    .status(status)
    .json({ error: safeToShow ? (err.message || "Internal server error") : "Internal server error" });
}

/**
 * Magic-byte signatures, shared by every upload handler in this file.
 *
 * WHY THIS EXISTS ALONGLIDE THE fileFilter allowlist: the allowlist reads
 * `file.mimetype`, which is a value the CLIENT chose. Renaming `payload.exe` to
 * `payload.png` and declaring `Content-Type: image/png` walks straight past a
 * mimetype-only check. Content is decided by the bytes, not by what the caller claims.
 *
 * Deliberately conservative and format-specific rather than a generic "is this text?"
 * probe, so an executable can never be waved through as a document.
 */
const MAGIC_SIGNATURES = [
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/gif", test: (b) => b.length > 6 && b.slice(0, 3).toString("latin1") === "GIF" },
  { mime: "application/pdf", test: (b) => b.length > 5 && b.slice(0, 5).toString("latin1") === "%PDF-" },
  {
    // OOXML and legacy Office formats are ZIP containers (PK\x03\x04) or OLE compound
    // files. Distinguishing them fully is out of scope; what matters here is that the
    // bytes are a recognised document container and not an executable or a script.
    mime: "application/vnd.openxmlformats-officedocument.*",
    test: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  {
    mime: "application/msword",
    test: (b) => b.length > 8 && b.slice(0, 8).toString("latin1") === "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
  },
];

/** Identifies a buffer by content, or null when it matches nothing approved. */
function identifyUpload(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (b.length === 0) return null;
  return MAGIC_SIGNATURES.find((s) => {
    try {
      return s.test(b);
    } catch {
      return false;
    }
  }) || null;
}

/**
 * Rejects anything whose bytes do not match a known-good signature.
 *
 * Returns true when the upload may proceed, false after sending 400. Called by every
 * handler here so the three endpoints cannot drift apart.
 */
function rejectUnknownContent(req, res) {
  const kind = identifyUpload(req.file && req.file.buffer);
  if (kind) return true;
  res.status(400).json({
    error:
      "File content was not recognised. Only images (JPG, PNG, GIF), PDF and Office documents are accepted.",
  });
  return false;
}

const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    // Configuration is checked BEFORE content on purpose. An unconfigured server should
    // say "not configured" (503) for every caller rather than answering some with a 400
    // about their bytes: the storage problem is real, global, and the thing an operator
    // has to fix first. Validating content first made a misconfiguration look like a
    // user's bad file, which is exactly the confusion this module's error handling
    // exists to remove.
    const { cloudName, preset } = requireCloudinaryConfig();
    if (!rejectUnknownContent(req, res)) return;

    // The type Cloudinary is told is the one the CONTENT proved, not the declared one.
    const kind = identifyUpload(req.file.buffer);
    const formData = new FormData();
    formData.append("file", `data:${kind.mime};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (data.secure_url) {
      return res.json({ url: data.secure_url });
    }
    return cloudinaryRejection(res, data);
  } catch (err) {
    return sendError(res, err);
  }
};

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const { cloudName, preset } = requireCloudinaryConfig();
    if (!rejectUnknownContent(req, res)) return;

    const formData = new FormData();
    formData.append("file", `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);
    formData.append("resource_type", "raw");

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!data.secure_url) {
      return cloudinaryRejection(res, data);
    }

    const fileExt = req.file.originalname.split(".").pop().toLowerCase();
    const typeByExt = { pdf: "pdf", xlsx: "xlsx", xls: "xlsx", docx: "docx", doc: "docx", pptx: "pptx", ppt: "pptx" };
    const type = typeByExt[fileExt] || "other";

    const size = req.file.size > 1048576
      ? `${(req.file.size / 1048576).toFixed(1)} MB`
      : `${(req.file.size / 1024).toFixed(0)} KB`;

    const docData = {
      id: randomUUID(),
      name: req.file.originalname,
      category: "Uploads",
      type,
      size,
      file_url: data.secure_url,
      created_at: new Date().toISOString(),
    };

    let inserted = docData;
    try {
      const { data: logged, error } = await supabase
        .from("documents")
        .insert(docData)
        .select()
        .single();
      if (error) throw error;
      inserted = logged;
    } catch (dbErr) {
      console.error("Uploaded file could not be logged to documents:", dbErr.message);
    }

    res.status(201).json({ url: data.secure_url, ...transformKeys(inserted) });
  } catch (err) {
    return sendError(res, err);
  }
};

const uploadConditionPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const { cloudName, preset } = requireCloudinaryConfig();
    if (!rejectUnknownContent(req, res)) return;

    const formData = new FormData();
    formData.append("file", `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (data.secure_url) {
      return res.json({ url: data.secure_url, publicId: data.public_id });
    }
    return cloudinaryRejection(res, data);
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports = { upload, uploadImage, uploadDocument, uploadConditionPhoto };
