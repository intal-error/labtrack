const KIOSK_SECRET = process.env.KIOSK_SECRET;

function kioskAuth(req, res, next) {
  if (!KIOSK_SECRET) {
    console.error("[KIOSK] KIOSK_SECRET not set in environment. Kiosk auth disabled.");
    return next();
  }

  const token = req.headers["x-kiosk-token"];
  if (!token || token !== KIOSK_SECRET) {
    return res.status(403).json({ error: "Invalid kiosk credentials" });
  }
  next();
}

module.exports = { kioskAuth };
