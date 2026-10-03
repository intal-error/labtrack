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

const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET;

    const formData = new FormData();
    formData.append("file", `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (data.secure_url) {
      res.json({ url: data.secure_url });
    } else {
      res.status(400).json({ error: "Upload failed", details: data });
    }
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET;

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
      return res.status(400).json({ error: "Upload failed", details: data });
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
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const uploadConditionPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET;

    const formData = new FormData();
    formData.append("file", `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (data.secure_url) {
      res.json({ url: data.secure_url, publicId: data.public_id });
    } else {
      res.status(400).json({ error: "Upload failed", details: data });
    }
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { upload, uploadImage, uploadDocument, uploadConditionPhoto };
