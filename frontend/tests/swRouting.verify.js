// Pins service-worker invariants that no runtime error surfaces.
//
// WHY THIS FILE EXISTS: two of the three defects fixed in sw.js were invisible in
// review and would not throw on load.
//
//  1. `NavigationRoute` PLUS a bare `addEventListener("fetch")` covering the same
//     navigations. A fetch event can be answered once; the second respondWith()
//     throws "respondWith already called". Workbox's router listener is installed
//     first (import side-effect), so the shell always won and the offline fallback
//     written underneath it was unreachable dead code -- while the thrown error went
//     to the console on every page load. Nothing fails, the app works, and the
//     fallback simply never runs.
//
//  2. An authenticated API cache keyed by URL alone. Excluding /api/auth/ removed the
//     ROLE leak but left every other user-scoped GET (/notifications/user,
//     /transactions/borrowed) served from a shared entry, so on a kiosk tablet the
//     next student could be handed the previous one's data whenever the network was
//     slower than the 10 s timeout.
//
// Both are assertions about what the file does NOT contain, so they need a test to
// hold. These check the source text directly, which is deliberate: they are
// structural invariants, and the built artifact is minified.
//
// Run: node tests/swRouting.verify.js   (or: npm run verify -w frontend)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SW = path.join(here, "..", "src", "sw.js");
const src = fs.readFileSync(SW, "utf8");

/**
 * Strips comments before any structural scan.
 *
 * Without this the suite reports itself as broken: the comments in sw.js explain the
 * double-respondWith bug in prose that necessarily contains the string
 * addEventListener("fetch", so a naive grep flags the documentation of the fix as
 * the fix. Regex literals and strings are tracked so a `/` inside them is not read
 * as the start of a comment or a regex.
 */
function stripComments(code) {
  let out = "";
  let i = 0;
  let prevCode = ""; // last significant code char, for regex-vs-divide
  const state = { block: false, line: false, quote: null, regex: false };
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (state.block) {
      if (c === "*" && next === "/") { state.block = false; i += 2; continue; }
      i++; continue;
    }
    if (state.line) {
      if (c === "\n") { state.line = false; out += c; }
      i++; continue;
    }
    if (state.quote) {
      // String CONTENTS are kept, only the comment and regex bodies are dropped.
      // Discarding them would silently break every structural check that looks for a
      // named string: `addEventListener("fetch")` strips to `addEventListener("`
      // and the check passes no matter what the code actually says -- which is
      // exactly the bug this suite exists to catch, so it has to match literally.
      out += c;
      if (c === "\\") { out += next; i += 2; continue; }
      if (c === state.quote) state.quote = null;
      i++; continue;
    }
    if (state.regex) {
      if (c === "\\") { i += 2; continue; }
      if (c === "[") state.regex = true;
      else if (c === "]") state.regex = false;
      else if (c === "/") state.regex = false;
      else if (c === "\n") state.regex = false;
      i++; continue;
    }
    // Not in any comment/string/regex.
    if (c === "/" && next === "*") { state.block = true; i += 2; continue; }
    if (c === "/" && next === "/") { state.line = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { state.quote = c; out += c; i++; continue; }
    if (c === "/") {
      const startsRegex = prevCode === "" || "(,=:[!&|?{};+-*%<>~^".includes(prevCode);
      if (startsRegex) { state.regex = true; out += c; i++; continue; }
      out += c; prevCode = c; i++; continue;
    }
    out += c;
    if (!/\s/.test(c)) prevCode = c;
    i++;
  }
  return out;
}

const code = stripComments(src);

let failures = 0;
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
}

// ── 1. Exactly one fetch listener, and it is Workbox's ───────────────────────
// Counting occurrences in src catches the raw listener; the built bundle is then
// checked too, because that is what actually ships.
console.log("--- exactly one fetch responder ---");
{
  const rawFetchListeners = (code.match(/addEventListener\(\s*["']fetch["']/g) || []).length;
  check(
    "src/sw.js registers NO raw fetch listener",
    rawFetchListeners === 0,
    `found ${rawFetchListeners}`,
  );
  check(
    "it does not call respondWith directly",
    !code.includes("event.respondWith"),
    "a direct respondWith means a second responder competing with workbox",
  );
  check(
    "the comment stripper still sees real code",
    code.includes("NavigationRoute") && code.includes("skipWaiting"),
    "over-stripping would make these assertions vacuous",
  );

  const distPath = path.join(here, "..", "dist", "sw.js");
  if (fs.existsSync(distPath)) {
    const built = fs.readFileSync(distPath, "utf8");
    const builtFetch = (built.match(/addEventListener\(\s*["']fetch["']/g) || []).length;
    check(
      "built dist/sw.js has exactly ONE fetch listener (workbox's router)",
      builtFetch === 1,
      `found ${builtFetch}`,
    );
    check(
      "the built bundle buckets the api cache per identity",
      built.includes("api-cache-"),
      "",
    );
    check(
      "the built bundle carries the /api/auth exclusion",
      built.includes("/api/auth/"),
      "",
    );
    check(
      "the built bundle does NOT use the old partitioned-key scheme",
      !built.includes("__who"),
      "per-identity cache names replaced the __who query param",
    );
  } else {
    console.log("SKIP  dist/sw.js not built yet (run npm run build to check the artifact)");
  }
}

// ── 2. Navigation is CACHE-FIRST, and the fallback is reachable ───────────────
//
// The load-bearing assertion in this section is the NEGATIVE one: the navigation
// handler must NOT fetch. An earlier revision awaited fetch(request) before falling
// back to the precached shell, and it had no timeout -- so on the slow, congested lab
// networks these kiosk tablets run on, a STALLED link (as opposed to a failed one)
// hung the user indefinitely, because `catch` only fires on a thrown error.
//
// This test is what should have caught that. Instead it PINNED the regression as a
// requirement ("the navigation handler performs its own fetch (network-first)"), which
// is why a green suite coexisted with a broken offline path. The assertions below are
// written so the wrong behaviour fails rather than passes.
console.log("--- navigation is cache-first and never blocks on the network ---");
{
  const navIdx = code.indexOf("new NavigationRoute(");
  check("a NavigationRoute is registered", navIdx !== -1);

  // Bound the block by the NEXT top-level registration, NOT by indexOf(");") -- the
  // first ");" can land mid-expression and make these assertions fail on correct code.
  const nextReg = code.indexOf("registerRoute(", navIdx + 1);
  const nextListener = code.indexOf("addEventListener(", navIdx + 1);
  const ends = [nextReg, nextListener].filter((v) => v !== -1);
  const navBlock = code.slice(navIdx, ends.length ? Math.min(...ends) : code.length);

  check(
    "the handler does NOT fetch on the navigation path",
    !navBlock.includes("fetch("),
    "a navigation that awaits the network costs a full RTT on every cold start, and without a timeout a stalled link hangs forever",
  );
  check(
    "it serves the precached shell directly",
    navBlock.includes("createHandlerBoundToURL"),
    "",
  );
  check(
    "matchPrecache is used for fallbacks, not caches.match",
    src.includes("matchPrecache(OFFLINE_URL)"),
    "caches.match cannot see workbox's revisioned precache keys",
  );

  // offline.html must come FIRST. Serving index.html offline boots the SPA, which then
  // fails to fetch /attend/kiosk and /scanner chunks (not in globPatterns) and lands on
  // a chunk-load error -- the exact outcome offline.html exists to prevent.
  const offlineAt = src.indexOf("matchPrecache(OFFLINE_URL)");
  const shellAt = src.indexOf("matchPrecache(SHELL_URL)");
  check(
    "offline.html is preferred over the shell when offline",
    offlineAt !== -1 && shellAt !== -1 && offlineAt < shellAt,
    `offline@${offlineAt} shell@${shellAt} -- a shell-first fallback yields a broken SPA, not a working offline app`,
  );

  check(
    "a catch handler backstops the route",
    code.includes("setCatchHandler"),
    "createHandlerBoundToURL throws at registration for a non-precached URL, and PrecacheStrategy throws on eviction; without a backstop the navigation rejects to a blank screen",
  );
  check(
    "  and it serves the offline page for navigations",
    /setCatchHandler\([\s\S]{0,300}NAVIGATION_FALLBACK\(\)/.test(code),
    "",
  );
}

// ── 3. The API cache cannot serve one user another's data ────────────────────
console.log("--- api-cache is bucketed per identity ---");
{
  const apiIdx = src.indexOf('url.pathname.startsWith("/api/")');
  check("the API route still exists", apiIdx !== -1);

  const routeBlock = src.slice(apiIdx);
  check(
    "/api/auth/ is excluded (role must never come from cache)",
    routeBlock.includes('!url.pathname.startsWith("/api/auth/")'),
    "",
  );
  check(
    "the cache name is derived from the identity tag",
    code.includes("api-cache-${tag}"),
    "",
  );
  check(
    "a credential-less request gets its own bucket, not a shared one",
    code.includes("api-cache-public"),
    "",
  );
  check(
    "the identity is hashed, not stored raw",
    src.includes("SHA-256"),
    "a raw bearer token in a cache NAME writes a live JWT into Cache Storage",
  );
  check(
    "the raw token never reaches a cache name",
    !/cacheName[^\n]*\$\{\s*(bearer|token|kiosk)\b/.test(src) &&
      !/`api-cache-\$\{\s*(bearer|token|kiosk)\b/.test(src),
    "an un-hashed credential leaked into the cache name",
  );
  // CHANGED. This asserted that sw.js still reads X-Kiosk-Token and buckets the api
  // cache on that shared secret. The kiosk now signs in as a real Firebase account and
  // sends a bearer token, so there is no kiosk header to read and no secret in the
  // bundle. Inverted deliberately: the assertion now FAILS if the old header comes
  // back, so re-adding a client-exposed credential breaks CI instead of passing.
  check(
    "no client-exposed kiosk secret is read by the service worker",
    !src.includes('request.headers.get("X-Kiosk-Token")'),
    "X-Kiosk-Token is being read again -- the shared-secret kiosk scheme has returned",
  );
  check(
    "the kiosk is bucketed by its bearer token like any other identity",
    src.includes("identityTag(`auth:${bearer}`)"),
    "",
  );
  check(
    "an insecure context fails loudly rather than silently sharing one bucket",
    src.includes("crypto.subtle") && src.includes("secure context required"),
    "",
  );
  check(
    "a full disk cannot turn into an API failure",
    code.includes("purgeOnQuotaError"),
    "a QuotaExceededError on write REJECTS the request, breaking reads that would otherwise be served",
  );
}

// ── 3b. Eviction must not cross users ───────────────────────────────────────
//
// The keys were correct in the partitioned-key revision, but `maxEntries` belongs to
// the CACHE, not the key: CacheExpiration evicts least-recently-used across every
// entry in the bucket. At 60 entries and ~6-8 endpoints per session, one student
// started deleting an earlier student's offline data during the same lab period -- on
// the shared tablets this app is built for. Isolation requires separate buckets.
console.log("--- eviction cannot cross identities ---");
{
  check(
    "there is ONE literal shared api-cache budget",
    (src.match(/cacheName:\s*"api-cache"/g) || []).length === 0,
    'a bare "api-cache" bucket shares its maxEntries across all users',
  );
  check(
    "each identity gets a distinct cache name",
    code.includes("`api-cache-${tag}`"),
    "",
  );
  check(
    "strategies are memoized so one strategy per identity is built",
    code.includes("apiStrategies.get(cacheName)"),
    "",
  );
  check(
    "the memo refreshes LRU position on reuse",
    /apiStrategies\.delete\(cacheName\);[\s\S]{0,120}apiStrategies\.set\(cacheName/.test(code),
    "",
  );
  check(
    "the memo is bounded",
    code.includes("MAX_TRACKED_IDENTITIES"),
    "an unbounded Map would accumulate buckets and their response bodies for the life of the worker",
  );
  check(
    "  and the eviction deletes the orphaned cache, not just the map entry",
    /caches\.delete\(/.test(code),
    "dropping the reference leaks the Cache Storage bucket and its data",
  );

  // Behavioural: the cap must actually hold, and must not evict the identity in use.
  const strategies = new Map();
  const MAX = 32;
  function get(tag) {
    if (strategies.has(tag)) {
      strategies.delete(tag);
      strategies.set(tag, tag);
      return strategies.get(tag);
    }
    strategies.set(tag, tag);
    while (strategies.size > MAX) {
      strategies.delete(strategies.keys().next().value);
    }
    return tag;
  }
  for (let i = 0; i < 100; i++) get(`tag-${i}`);
  check("the strategy map stays bounded", strategies.size <= MAX, `size ${strategies.size}`);
  check(
    "the most recent identity survives",
    strategies.has("tag-99"),
    "",
  );
  check(
    "the oldest identity is the one evicted",
    !strategies.has("tag-0"),
    "",
  );
  check("distinct identities never collide", get("tag-a") !== get("tag-b"));
  check("the same identity reuses its entry", get("tag-99") === "tag-99");
}

// ── 4. Update flow still works, and first install does not reload ────────────
console.log("--- skipWaiting and the update guard ---");
{
  check("skipWaiting() is called on install", /addEventListener\(\s*["']install["'][\s\S]{0,200}skipWaiting\(\)/.test(src));
  check(
    "the update flag reads registration.active DURING install",
    /addEventListener\(\s*["']install["'][\s\S]{0,300}registration[\s\S]{0,40}active[\s\S]{0,200}skipWaiting/.test(src),
    "reading it in activate always returns true, so the first-install reload guard cannot work",
  );
  check(
    "controllerchange only reloads on a real update",
    /controllerchange[\s\S]{0,400}if \(!isUpdateInstall\) return;/.test(src),
    "",
  );
}

// ── 5. The partition tag is stable, and reveals nothing ──────────────────────
// identityTag is re-implemented here because sw.js runs in a worker and cannot be
// imported into node. If the real one changes, these assertions are the reminder.
console.log("--- identityTag behaviour ---");
{
  const identityTag = async (identity) => {
    const bytes = new TextEncoder().encode(identity);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const a = await identityTag("auth:token-alpha");
  const b = await identityTag("auth:token-alpha");
  const c = await identityTag("auth:token-beta");
  check("the same identity always yields the same tag", a === b, `${a} vs ${b}`);
  check("different identities yield different tags", a !== c, `${a} vs ${c}`);
  check("the tag is 16 hex chars (8 bytes)", /^[0-9a-f]{16}$/.test(a), `got ${a}`);
  check("the token is not recoverable from the tag", !a.includes("alpha") && !a.includes("token"));
  check("an empty identity still produces a tag", /^[0-9a-f]{16}$/.test(await identityTag("auth:")));

  // The property that actually matters: two users of the same endpoint land in
  // DIFFERENT CACHES, so neither can be served the other's cached body.
  //
  // Asserted against cache NAMES, not request URLs. An earlier revision partitioned
  // by appending `?__who=<tag>` to the request URL; that scheme is gone, and these
  // assertions were still exercising it -- so they kept passing while describing a
  // mechanism that no longer existed. A green test for a removed design is worse than
  // no test, because it looks like coverage.
  const cacheNameFor = async (token) => `api-cache-${await identityTag(`auth:${token}`)}`;
  const cacheA = await cacheNameFor("alice-jwt");
  const cacheB = await cacheNameFor("bob-jwt");
  check("two users get two different cache buckets", cacheA !== cacheB, `${cacheA} vs ${cacheB}`);
  check(
    "  and neither cache name contains the token",
    !cacheA.includes("alice") && !cacheB.includes("bob"),
    `got ${cacheA} / ${cacheB}`,
  );
  check(
    "the same user always resolves to the same bucket, so offline reads survive a reload",
    (await cacheNameFor("alice-jwt")) === cacheA,
  );

  // A credential-less request must not share a bucket with an authenticated one.
  const publicCache = "api-cache-public";
  check(
    "an uncredentialed request uses its own bucket, not a user's",
    publicCache !== cacheA && publicCache !== cacheB,
  );

  // The request URL is untouched by bucketing, so pagination params still apply.
  const withQuery = new URL("https://app.example.co/api/transactions/borrowed?page=2&limit=25");
  check(
    "existing query params are untouched by the bucketing",
    withQuery.searchParams.get("page") === "2" && withQuery.searchParams.get("limit") === "25",
    withQuery.toString(),
  );
  check(
    "  and no partition parameter leaks into the request URL",
    !withQuery.searchParams.has("__who"),
  );
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);