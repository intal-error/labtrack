const QRCode = require("qrcode");

const generateQR = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });

    const dataUrl = await QRCode.toDataURL(text, {
      width: 220,
      margin: 2,
      color: { dark: "#002f17", light: "#ffffff" },
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { generateQR };
