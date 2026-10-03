const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: false });

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

module.exports = { cache, CACHE_KEY_PREFIX, cacheKey, invalidateCache };
