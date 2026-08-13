const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { upload, uploadImage };
