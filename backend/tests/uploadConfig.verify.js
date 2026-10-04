/**
 * Verifies the upload path can no longer fail silently.
 *
 * Background: CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET are declared
 * `sync: false` in render.yaml, so Render never receives them from the repo and
 * they exist only in the dashboard. backend/.env is gitignored. The controller
 * interpolated them into the Cloudinary URL with no check, so a deploy missing
 * them requested `api.cloudinary.com/v1_1/undefined/image/upload`, got an error
 * back, and answered 400 "Upload failed" — the same response a rejected file
 * type, an oversized file and a spent rate limit all produced. Image uploads
 * were broken in production while localhost worked, and nothing said why.
 *
 * These cases pin the three properties that make that class of failure
 * diagnosable:
 *  - absent/blank credentials fail fast with 503 and name the missing variables
 *  - a Cloudinary rejection carries Cloudinary's own message, not a flat string
 *  - a healthy config still returns the URL the client stores
 *
 * fetch is replaced rather than allowed to reach the network, so this runs
 * offline and asserts on the exact response the user would have been shown.
 *
 * Run: node backend/tests/uploadConfig.verify.js
 */
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

// The controller pulls in the real Supabase client at require time. Swap it for
// an in-memory stub before it loads.
function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

stub("../src/config/supabase", {
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
});

const uploadController = require("../src/controllers/uploadController");
const { uploadLimiter, qrLimiter, generalLimiter, shouldSkipQr } = require("../src/middleware/rateLimits");

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function mockRes() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

// The smallest thing multer.memoryStorage can hand the controller: it only ever
// reads `mimetype` and `buffer` off `req.file`.
function fakeFile(mimetype = "image/png") {
  return { mimetype, buffer: Buffer.from("fake-image-bytes"), originalname: "photo.png", size: 15 };
}

/** Installs a fetch stub and returns the URLs it was called with. */
function stubFetch(handler) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: options?.body });
    return { json: async () => handler(url) };
  };
  return calls;
}

/** Runs an upload handler against the current env and reports what it answered. */
async function attempt(handler = uploadController.uploadImage, file = fakeFile()) {
  const res = mockRes();
  await handler({ file }, res);
  return res;
}

/**
 * Drives the real uploadLimiter middleware with a stand-in req/res.
 *
 * WHY functional and not a property check: express-rate-limit v8 only exposes
 * `resetKey` and `getKey` on the returned middleware — it does not re-expose
 * `skip` — so an assertion like `uploadLimiter.skip === shouldSkipQr` would pass
 * or fail for reasons unrelated to whether the exemption actually works.
 * Counting real requests is the only way to prove the budget behaviour.
 */
function hitLimiter(mw, path, ip) {
  return new Promise((resolve) => {
    const req = { path, method: "POST", ip, headers: {}, socket: {} };
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      removeHeader() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      write() { return true; },
      status(code) { this.statusCode = code; return this; },
      json() { resolve(this.statusCode); return this; },
      end() { resolve(this.statusCode); return this; },
    };
    mw(req, res, () => resolve(res.statusCode));
  });
}

async function limiterSequence(count, path, ip) {
  const codes = [];
  for (let i = 0; i < count; i++) codes.push(await hitLimiter(uploadLimiter, path, ip));
  return codes;
}

async function drive(mw, count, ip, method = "GET") {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(await new Promise((resolve) => {
      const req = { path: "/x", method, ip, originalUrl: "/api/x", user: { uid: "u1" }, headers: {}, socket: {} };
      const res = {
        statusCode: 200,
        setHeader() {}, getHeader() {}, removeHeader() {},
        on() { return this; }, once() { return this; }, emit() { return false; }, write() { return true; },
        status(c) { this.statusCode = c; return this; },
        json() { resolve(this.statusCode); return this; },
        end() { resolve(this.statusCode); return this; },
      };
      mw(req, res, () => resolve(res.statusCode));
    }));
  }
  return codes;
}

const allowed = (codes) => codes.filter((c) => c === 200).length;
const throttled = (codes) => codes.filter((c) => c === 429).length;

function setCloudinaryEnv({ cloudName, preset }) {
  if (cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = cloudName;
  if (preset === undefined) delete process.env.CLOUDINARY_UPLOAD_PRESET;
  else process.env.CLOUDINARY_UPLOAD_PRESET = preset;
}

(async () => {
  // Silence the controller's own diagnostics so a passing run is readable.
  const realError = console.error;
  const realWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  console.log("--- missing Cloudinary configuration is refused, not guessed ---");

  setCloudinaryEnv({ cloudName: undefined, preset: "tools_uploads" });
  let res = await attempt();
  check("missing cloud name -> 503", res.statusCode, 503);
  check("names the missing variable", res.payload.error, "Image storage is not configured on the server (missing CLOUDINARY_CLOUD_NAME).");
  check("names the missing variable (preset)", (await (async () => {
    setCloudinaryEnv({ cloudName: "dvfa28qzr", preset: undefined });
    const r = await attempt();
    return r.payload.error;
  })()), "Image storage is not configured on the server (missing CLOUDINARY_UPLOAD_PRESET).");

  setCloudinaryEnv({ cloudName: undefined, preset: undefined });
  res = await attempt();
  check("both missing -> 503 naming both", res.payload.error, "Image storage is not configured on the server (missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET).");

  // The original defect: a blank value was interpolated into the hostname,
  // producing a live request to `.../v1_1/undefined/image/upload`.
  setCloudinaryEnv({ cloudName: "   ", preset: "tools_uploads" });
  let calls = stubFetch(() => ({ secure_url: "https://res.cloudinary.com/x.png" }));
  res = await attempt();
  check("whitespace-only cloud name -> 503", res.statusCode, 503);
  check("whitespace-only cloud name never reaches the network", calls.length, 0);

  console.log("--- every handler is guarded, not just /upload/image ---");

  setCloudinaryEnv({ cloudName: undefined, preset: undefined });
  for (const [name, handler] of [
    ["uploadImage", uploadController.uploadImage],
    ["uploadDocument", uploadController.uploadDocument],
    ["uploadConditionPhoto", uploadController.uploadConditionPhoto],
  ]) {
    const r = await attempt(handler);
    check(`${name} -> 503 when unconfigured`, r.statusCode, 503);
  }

  console.log("--- Cloudinary's own message reaches the client ---");

  setCloudinaryEnv({ cloudName: "dvfa28qzr", preset: "tools_uploads" });
  calls = stubFetch(() => ({ error: { message: "Invalid cloud name" } }));
  res = await attempt();
  check("rejection -> 400", res.statusCode, 400);
  check("surfaces Cloudinary's message, not 'Upload failed'", res.payload.error, "Invalid cloud name");

  calls = stubFetch(() => ({ error: { message: "preset not found" } }));
  res = await attempt();
  check("surfaces a preset error", res.payload.error, "preset not found");

  calls = stubFetch(() => ({}));
  res = await attempt();
  check("a body with no error still gets a usable message", res.payload.error, "Upload failed");

  console.log("--- a healthy config still works ---");

  calls = stubFetch(() => ({ secure_url: "https://res.cloudinary.com/labtrack/image/upload/photo.png" }));
  res = await attempt();
  check("success -> 200", res.statusCode, 200);
  check("returns the URL the form stores", res.payload.url, "https://res.cloudinary.com/labtrack/image/upload/photo.png");
  check("targets the configured cloud", calls[0].url, "https://api.cloudinary.com/v1_1/dvfa28qzr/image/upload");
  check("sends the configured preset", calls[0].body.get("upload_preset"), "tools_uploads");

  calls = stubFetch(() => ({ secure_url: "https://res.cloudinary.com/labtrack/raw/upload/manual.pdf", public_id: "x" }));
  res = await attempt(uploadController.uploadDocument, { mimetype: "application/pdf", buffer: Buffer.from("pdf"), originalname: "m.pdf", size: 3 });
  check("uploadDocument -> 201", res.statusCode, 201);
  check("uploadDocument targets the raw endpoint", calls[0].url, "https://api.cloudinary.com/v1_1/dvfa28qzr/raw/upload");
  check("uploadDocument still returns the URL even though its documents row was not written", res.payload.url, "https://res.cloudinary.com/labtrack/raw/upload/manual.pdf");

  console.log("--- production never leaks an internal error message ---");

  // The three handlers used to answer with err.message for anything carrying a
  // .status, which skipped the sanitisation errorHandler performs. Nothing
  // leaked at the time, but the rule now matches errorHandler exactly: reveal
  // only when explicitly marked exposeable, or outside production.
  const realNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    setCloudinaryEnv({ cloudName: "dvfa28qzr", preset: "tools_uploads" });
    stubFetch(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { status: 400 });
    });
    res = await attempt();
    check("a .status error without expose is sanitised in production", res.statusCode, 400);
    check("its message is not leaked", res.payload.error, "Internal server error");

    // The exposeable guard is the one case that must still be readable, or the
    // whole point of the 503 is lost.
    setCloudinaryEnv({ cloudName: undefined, preset: "tools_uploads" });
    res = await attempt();
    check("the exposeable config guard is still readable in production", res.payload.error, "Image storage is not configured on the server (missing CLOUDINARY_CLOUD_NAME).");

    setCloudinaryEnv({ cloudName: "dvfa28qzr", preset: "tools_uploads" });
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    res = await attempt();
    check("a statusless error still becomes a 500", res.statusCode, 500);
    check("a statusless error is sanitised in production", res.payload.error, "Internal server error");

    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    process.env.NODE_ENV = "development";
    res = await attempt();
    check("outside production the real message is kept", res.payload.error, "fetch failed");
  } finally {
    process.env.NODE_ENV = realNodeEnv;
  }

  console.log("--- QR generation must not consume an upload slot ---");

  // /upload/qr makes no outbound call (it is a local QRCode.toDataURL), but it
  // used to sit behind the same 15/hour budget the catalog photo uploads need.
  // The per-item QR button therefore ate the image budget invisibly.
  check("POST /qr is skipped by the upload limiter", shouldSkipQr({ path: "/qr" }), true);
  check("POST /qr/ (trailing slash) too", shouldSkipQr({ path: "/qr/" }), true);
  check("POST /image is NOT skipped", shouldSkipQr({ path: "/image" }), false);
  check("POST /document is NOT skipped", shouldSkipQr({ path: "/document" }), false);
  check("POST /condition-photo is NOT skipped", shouldSkipQr({ path: "/condition-photo" }), false);

  // The exemption has to hold in both directions: uploads stay capped, and QR
  // calls stay uncapped *and* spend nothing.
  const imageBurst = await limiterSequence(16, "/image", "9.9.9.1");
  check("uploads are still capped at 15/hour", allowed(imageBurst), 15);
  check("the 16th upload is throttled", throttled(imageBurst), 1);

  const qrBurst = await limiterSequence(40, "/qr", "9.9.9.2");
  check("40 QR calls are never throttled", throttled(qrBurst), 0);

  // Decisive: spend the whole budget on uploads, then prove a QR call still
  // passes and does not hand a 16th slot to the next upload.
  await limiterSequence(15, "/image", "9.9.9.3");
  const qrAfterExhaustion = await limiterSequence(5, "/qr", "9.9.9.3");
  check("QR still served once uploads are exhausted", throttled(qrAfterExhaustion), 0);
  const imageAfterQr = await hitLimiter(uploadLimiter, "/image", "9.9.9.3");
  check("...and the spent budget was not refilled by it", imageAfterQr, 429);

  // The third arrangement, and the one that has to hold: QR has its own bucket.
  // Putting it on generalLimiter looked reasonable but that limiter is a single
  // instance shared by all 13 read endpoints, so printing QR labels drew down
  // the same 100/15min pool as ordinary page loads and throttled browsing.
  check("qrLimiter is a distinct instance from generalLimiter", qrLimiter === generalLimiter, false);
  check("qrLimiter is a distinct instance from uploadLimiter", qrLimiter === uploadLimiter, false);

  await drive(generalLimiter, 90, "8.8.8.1");
  const qrOnOwnBucket = await drive(qrLimiter, 60, "8.8.8.1");
  check("60 QR prints stay within the QR bucket", throttled(qrOnOwnBucket), 0);

  // Decisive: the general/read pool must be completely untouched by all of that.
  const readsAfterQr = await drive(generalLimiter, 10, "8.8.8.1");
  check("...and 10 further page loads are NOT throttled", throttled(readsAfterQr), 0);

  const qrOverflow = await drive(qrLimiter, 1, "8.8.8.1");
  check("the 61st QR print IS throttled (still bounded)", qrOverflow[0], 429);

  console.log("--- no file is still a plain 400, not a config error ---");

  setCloudinaryEnv({ cloudName: undefined, preset: undefined });
  res = mockRes();
  await uploadController.uploadImage({}, res);
  check("missing file -> 400", res.statusCode, 400);
  check("missing file -> 'No file provided'", res.payload.error, "No file provided");

  console.error = realError;
  console.warn = realWarn;

  console.log("");
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
})();