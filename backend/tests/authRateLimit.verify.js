// Pins the rate-limit wiring, which was silently inert.
//
// WHY THIS FILE EXISTS: `authLimiter` was mounted in server.js as
//
//     app.use("/api/auth", authRoutes);
//     app.use("/api/auth/register", authLimiter);
//
// Express dispatches in registration order, so the router answered POST /register
// and finished the response before the limiter was reached. Both credential routes
// were unlimited in production while the comment above the mount asserted they were
// limited. A grep for "authLimiter" finds it, a unit test of the limiter function
// passes, and nothing notices -- the bug is in the ORDERING, which only an actual
// HTTP request through the assembled router can observe.
//
// So this test builds a real Express app around the real router and counts requests.
//
// Run: node tests/authRateLimit.verify.js   (or: npm run verify -w backend)

let failures = 0;

// src/config/firebase.js calls process.exit(1) at REQUIRE time when credentials are
// absent, and this test reaches it transitively (routes/auth -> transactionController
// -> config/firebase) for the profile-URL invalidator.
//
// Placeholder ENV VARS ARE NOT ENOUGH: admin.credential.cert() actually parses the
// private key as PEM and throws "Invalid PEM formatted message". The module is stubbed
// out instead, which is the pattern tests/authMiddleware.verify.js already uses.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder-key";

const firebaseConfigPath = require.resolve("../src/config/firebase");
require.cache[firebaseConfigPath] = {
  id: firebaseConfigPath,
  filename: firebaseConfigPath,
  loaded: true,
  exports: {
    admin: { firestore: () => ({ FieldPath: { documentId: () => "__name__" } }) },
    db: {},
    auth: {},
    FieldPath: { documentId: () => "__name__" },
  },
};

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
}

/** Minimal express-rate-limit-compatible stub, so the test does not spend 15 minutes
 *  waiting for a real window to expire. */
function stubLimiter({ max }) {
  const hits = new Map();
  const fn = (req, res, next) => {
    const key = req.ip || "unknown";
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) {
      res.status(429).json({ error: "Too many authentication attempts, please try again later" });
      return;
    }
    next();
  };
  fn.hits = hits;
  fn.max = max;
  // Both credential routes share ONE per-IP bucket, which is deliberate (it mirrors
  // the real authLimiter, key: null = IP). Tests below reset between phases so each
  // route's enforcement can be judged on its own; the shared behaviour is then
  // asserted explicitly at the end.
  fn.reset = () => hits.clear();
  return fn;
}

// ── Intercept the limiter module before requiring the router ──────────────────
const rateLimitsPath = require.resolve("../src/middleware/rateLimits");
const realRateLimits = require(rateLimitsPath);

const AUTH_LIMIT = 3; // small enough to trip in a test
const limiterCalls = [];

require.cache[rateLimitsPath].exports = {
  ...realRateLimits,
  authLimiter: Object.assign(
    stubLimiter({ max: AUTH_LIMIT }),
    {
      // Record that the middleware actually RAN, which is the whole point: the old
      // wiring never invoked it, so the mount existing proved nothing.
      __calls: limiterCalls,
    },
  ),
};

// Wrap it so invocations are observable. Without this the "did the limiter run"
// assertion was vacuous -- the old bug made that check fail by accident, and the
// fixed code passed it for the wrong reason (the array was simply never written to).
const stubbedLimiter = require.cache[rateLimitsPath].exports.authLimiter;
require.cache[rateLimitsPath].exports.authLimiter = function observableAuthLimiter(req, res, next) {
  limiterCalls.push(`${req.method} ${req.originalUrl}`);
  return stubbedLimiter(req, res, next);
};

// A body that satisfies registerSchema, so the assertions below measure the rate
// limiter and not the validator. Sending {} returned 400 for every request, which
// made "first 3 succeed" indistinguishable from "limit not enforced".
const VALID_REGISTRATION = {
  role: "student",
  firstName: "Ana",
  lastName: "Reyes",
  email: "ana@example.co",
  password: "hunter2secret",
  schoolId: "23-000039",
  course: "BIT",
  year: "3",
  section: "A",
};

// The real router, with the real middleware chain around it.
//
// ORDER MATTERS: every stub must be installed BEFORE requiring the router, because
// require() resolves and caches its whole dependency graph on first load. Loading
// authRoutes first and stubbing afterwards would exercise the real controllers --
// which is what produced "FATAL: Missing Firebase credentials" on the first run of
// this file.
const express = require("express");

// Controllers are stubbed so the test measures ROUTING, not Firestore. The real
// controller would need Firebase credentials and would reject on its own terms.
const controllerPath = require.resolve("../src/controllers/authController");
require.cache[controllerPath] = {
  id: controllerPath,
  filename: controllerPath,
  loaded: true,
  exports: {
    register: (req, res) => res.status(201).json({ uid: "u1" }),
    getProfile: (req, res) => res.json({ uid: "u1", role: "student" }),
    updateProfile: (req, res) => res.json({ uid: "u1" }),
    changePassword: (req, res) => res.json({ ok: true }),
  },
};

// verifyToken would otherwise reject with 401 before the limiter is reached on
// /password, making the limiter untestable. Replaced with a pass-through.
const authMiddlewarePath = require.resolve("../src/middleware/auth");
require.cache[authMiddlewarePath] = {
  id: authMiddlewarePath,
  filename: authMiddlewarePath,
  loaded: true,
  exports: {
    verifyToken: (req, res, next) => next(),
    authorize: () => (req, res, next) => next(),
    attachRole: (req, res, next) => next(),
    ensureProfile: async () => {},
    errorHandler: (err, req, res, _next) => res.status(500).json({ error: err.message }),
  },
};

const authRoutes = require("../src/routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

/** Drives the app with node's http server, no supertest dependency. */
function makeServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, method, path, body) {
  const { port } = server.address();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = require("node:http").request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: raw }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

(async () => {
  const server = await makeServer();
  const resetBucket = () => stubbedLimiter.reset();

  // ── 1. POST /register is actually limited ───────────────────────────────────
  console.log("--- POST /api/auth/register is rate limited ---");
  resetBucket();
  const statuses = [];
  for (let i = 0; i < AUTH_LIMIT + 2; i++) {
    statuses.push((await request(server, "POST", "/api/auth/register", VALID_REGISTRATION)).status);
  }
  check(
    `the first ${AUTH_LIMIT} valid registrations reach the controller (201)`,
    statuses.slice(0, AUTH_LIMIT).every((s) => s === 201),
    `got ${JSON.stringify(statuses)}`,
  );
  check(
    `requests past the limit get 429`,
    statuses.slice(AUTH_LIMIT).every((s) => s === 429),
    `got ${JSON.stringify(statuses)}`,
  );
  check(
    "the limiter middleware actually executed",
    limiterCalls.length >= AUTH_LIMIT + 2,
    `recorded ${limiterCalls.length} invocations`,
  );
  check(
    "  and it was invoked for the register route specifically",
    limiterCalls.some((c) => c.includes("/api/auth/register")),
    `recorded ${JSON.stringify(limiterCalls)}`,
  );

  // ── 2. PUT /password is actually limited ────────────────────────────────────
  console.log("--- PUT /api/auth/password is rate limited ---");
  resetBucket();
  const pw = [];
  for (let i = 0; i < AUTH_LIMIT + 2; i++) {
    pw.push((await request(server, "PUT", "/api/auth/password", { newPassword: "another-secret" })).status);
  }
  check(
    "the first password changes reach the controller",
    pw[0] === 200,
    `got ${JSON.stringify(pw)}`,
  );
  check(
    "password changes past the limit get 429",
    pw.slice(AUTH_LIMIT).every((s) => s === 429),
    `got ${JSON.stringify(pw)}`,
  );
  check(
    "  and the limiter ran on the password route",
    limiterCalls.some((c) => c.includes("/api/auth/password")),
    `recorded ${JSON.stringify(limiterCalls)}`,
  );

  // ── 3. Both credential routes share one per-IP budget ───────────────────────
  // Intended: the real authLimiter keys on IP only (key: null), so registration
  // attempts and password attempts draw down the same pool. That is what makes the
  // limiter useful against credential stuffing across both endpoints.
  console.log("--- register and password share one per-IP budget ---");
  resetBucket();
  const shared = [];
  for (let i = 0; i < AUTH_LIMIT; i++) {
    shared.push((await request(server, "POST", "/api/auth/register", VALID_REGISTRATION)).status);
  }
  // Budget now exhausted by register alone.
  shared.push((await request(server, "PUT", "/api/auth/password", { newPassword: "another-secret" })).status);
  check(
    "password is already throttled after register used the budget",
    shared[shared.length - 1] === 429,
    `got ${JSON.stringify(shared)}`,
  );
  check(
    "and it is not a separate bucket per route",
    stubbedLimiter.hits.size === 1,
    `buckets: ${JSON.stringify([...stubbedLimiter.hits.entries()])}`,
  );

  // ── 4. GET /profile stays unlimited ─────────────────────────────────────────
  // The regression to avoid while fixing #1: putting authLimiter on the whole
  // /api/auth mount would throttle profile reads, and on shared-NAT labs that
  // spends the entire login budget on one page load per user.
  console.log("--- GET /api/auth/profile is NOT rate limited ---");
  resetBucket();
  const profileStatuses = [];
  for (let i = 0; i < AUTH_LIMIT + 5; i++) {
    profileStatuses.push((await request(server, "GET", "/api/auth/profile")).status);
  }
  check(
    "profile reads are never throttled",
    profileStatuses.every((s) => s === 200),
    `got ${JSON.stringify(profileStatuses)}`,
  );

  // ── 5. PUT /profile stays unlimited ─────────────────────────────────────────
  console.log("--- PUT /api/auth/profile is NOT rate limited ---");
  const upd = [];
  for (let i = 0; i < AUTH_LIMIT + 5; i++) {
    upd.push((await request(server, "PUT", "/api/auth/profile", { firstName: "Ana" })).status);
  }
  check(
    "profile updates are never throttled",
    upd.every((s) => s === 200),
    `got ${JSON.stringify(upd)}`,
  );

  server.close();

  // ── 6. Static assertion: no mount may appear after the auth router ──────────
  console.log("--- no limiter is mounted after the auth router in server.js ---");
  const fs = require("node:fs");
  const path = require("node:path");
  const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const routerIdx = serverSrc.indexOf('app.use("/api/auth", authRoutes)');
  const strayLimiter = /app\.use\(\s*"\/api\/auth[^"]*"\s*,\s*\w*[Ll]imiter\s*\)/.exec(serverSrc);
  check(
    "server.js mounts no limiter on an /api/auth path",
    strayLimiter === null,
    strayLimiter ? `found: ${strayLimiter[0]}` : "",
  );
  check(
    "the /api/auth router is still mounted",
    routerIdx !== -1,
    "",
  );
  check(
    "authLimiter is applied inside routes/auth.js",
    /router\.post\("\/register",\s*authLimiter/.test(
      fs.readFileSync(path.join(__dirname, "..", "src", "routes", "auth.js"), "utf8"),
    ),
    "",
  );

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("test harness error:", err);
  process.exit(1);
});