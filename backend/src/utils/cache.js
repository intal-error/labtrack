const NodeCache = require("node-cache");

/**
 * Response cache for read-heavy GET endpoints.
 *
 * maxKeys: the key is `<uid>::<originalUrl>`, so every distinct (user, filter
 * combination) pair is its own entry. A user scrubbing through the filter
 * combinations on the Transactions or Attendance pages mints a new key per
 * keystroke, and without a ceiling the cache grows unbounded within its TTL window.
 *
 * useClones: was false, which means every cache HIT returned the SAME object
 * reference to every caller. Express then serialises it, which is harmless today
 * only because no controller mutates a response body after building it. Cloning
 * costs a little CPU per hit and removes that whole class of latent bug, so it is
 * on. Raise maxKeys if a busy deployment ever evicts before it should.
 */
const cache = new NodeCache({
  stdTTL: 30,
  checkperiod: 120,
  maxKeys: 2000,
  useClones: true,
});

const CACHE_KEY_PREFIX = "__cache__";

function cacheKey(req) {
  return `${CACHE_KEY_PREFIX}${req.user?.uid || "anon"}::${req.originalUrl}`;
}

function invalidateCache(pathPrefix) {
  const marker = `::${pathPrefix}`;
  const keys = cache.keys();
  let removed = 0;
  for (const key of keys) {
    if (key.includes(marker)) {
      cache.del(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Express middleware form: invalidates a feature's cached GETs, then continues.
 *
 * WHY THIS EXISTS: cacheMiddleware is mounted on eight routes but was invalidated on
 * exactly one (manualController, and only for /api/manuals). Every other write --
 * catalog, incidents, fines, borrow-requests, maintenance, settings -- left its GET
 * responses cached for the full TTL. That is not only wasted memory: the write
 * returns, the client's follow-up read is served stale, the UI looks broken, and the
 * user re-submits the write. Worse, a write does not even have to be on the same
 * path -- creating a borrow request changes the Transactions table, and only the
 * borrow-requests prefix was ever cleared.
 *
 * Mount it on every mutating route:
 *   router.post("/", attachRole, invalidateFeature("/api/borrow-requests"), handler)
 */
function invalidateFeature(pathPrefix) {
  return (_req, _res, next) => {
    invalidateCache(pathPrefix);
    next();
  };
}

module.exports = { cache, CACHE_KEY_PREFIX, cacheKey, invalidateCache, invalidateFeature };
