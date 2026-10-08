/**
 * LabTrack service worker.
 *
 * WHY THIS IS A HAND-WRITTEN SW AND NOT vite-plugin-pwa's generateSW: the
 * generated worker cannot express "navigate to the app shell when online, to a
 * friendly offline page when not". Its only navigation strategy is a single
 * navigateFallback, so choosing offline.html for it would serve the offline page
 * to every online user too. That distinction needs a real handler, which is why
 * the plugin is switched to injectManifest below. Workbox itself is still the
 * implementation -- no new dependency.
 *
 * Three caching tiers:
 *   1. Precached at install: the shell, its CSS, the vendor code it executes, the
 *      icons, and offline.html. Sized deliberately -- see the globPatterns list in
 *      vite.config.js. Precaching everything here cost 3.4 MiB on first visit
 *      (including 401 kB of charting library and a 326 kB QR scanner that a given
 *      user may never open).
 *   2. Route chunks: stale-while-revalidate. Hashed filenames make a hit safe to
 *      serve instantly; the revalidation keeps a new deploy reachable.
 *   3. API GETs: network-first with a 10 s timeout, then cache. Offline the app
 *      still shows the last known data with an offline banner rather than an
 *      empty screen. Writes are never cached -- see the fetch handler note.
 */

import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
} from "workbox-precaching";
import { NavigationRoute, registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";

clientsClaim();
cleanupOutdatedCaches();

// Injected at build time with the hashed asset list.
precacheAndRoute(self.__WB_MANIFEST);

const SHELL_URL = "/index.html";
const OFFLINE_URL = "/offline.html";

/*
 * A new worker takes over immediately, rather than waiting for every tab to close.
 *
 * WHY THIS IS NOT AUTOMATIC: `registerType: "autoUpdate"` in vite.config.js only
 * sets `workbox.skipWaiting`, and `workbox.*` is consumed by the GENERATED worker
 * alone. Under `injectManifest` (which this project uses, for the navigation
 * handling above) the plugin reads my source verbatim and that option is inert.
 * Verified in the built artifact: the only skipWaiting() is inside the message
 * handler, and nothing ever sent it -- so an old SW stayed active and a
 * cache-first precached shell meant a deploy never reached anyone with a tab open.
 * That is the worst kind of PWA bug: silent, and it runs yesterday's build all day.
 *
 * The controllerchange reload gives a newly-controlled page its new assets rather
 * than leaving it rendering against a mix of old and new chunks.
 */

// The actual take-over. clientsClaim() only takes over pages that are ALREADY
// controlled by this worker (i.e. on a later navigation); without skipWaiting a
// new worker sits in `waiting` while the old one keeps control, so a deploy would
// never reach anyone with a tab open.
//
// `registration.active` is read HERE, during install, and not in an activate
// listener. In the installing worker it refers to the PREVIOUSLY activated worker:
// null on a first visit, non-null on an update. Reading it from `activate` instead
// -- where the newly-activated worker is itself already `active` -- always returned
// true, so the guard could not tell the two cases apart and the "don't reload on
// first install" rule never held: every first visit reloaded once, discarding
// whatever the user was looking at.
let isUpdateInstall = false;
self.addEventListener("install", () => {
  isUpdateInstall = Boolean(self.registration && self.registration.active);
  self.skipWaiting();
});

self.addEventListener("controllerchange", () => {
  // Fires on the very first install too. Only reload when an older worker was
  // actually replaced, otherwise a first visit gets a pointless refresh.
  if (!isUpdateInstall) return;
  self.clients.matchAll({ type: "window" }).then((clients) => {
    clients.forEach((client) => client.navigate(client.url));
  });
});

// Keeps the previous worker's skipWaiting() call available for anything that
// prefers the message protocol (e.g. a future update flow).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

/*
 * Navigations -> the network, falling back to the precached app shell.
 *
 * `NavigationRoute` with a real handler function, rather than the default
 * createHandlerBoundToURL(SHELL_URL) plus a second `fetch` listener.
 *
 * WHY: registerRoute() installs its OWN fetch listener, and a fetch event can only
 * be answered once -- a second respondWith() throws "respondWith already called".
 * So a NavigationRoute and a bare addEventListener("fetch") covering the same
 * navigations cannot coexist: whichever registered second throws on every single
 * navigation. Because Workbox's listener is registered first (import side-effect),
 * the shell always won and the offline fallback below it was unreachable dead code,
 * while the thrown InvalidStateError went to the console on every page load. Keeping
 * one handler makes the fallback reachable and removes the error.
 *
 * The denylist still matters:
 *
 *   - /api/* must reach the network untouched. Pasting an API URL into the address
 *     bar must not return the HTML shell where JSON was expected.
 *   - Real files (an image, a .webmanifest) must not be answered with HTML.
 *
* The fallbacks use matchPrecache, NOT caches.match. Workbox stores precached entries
 * under a REVISIONED key -- `/index.html?__WB_REVISION__=<hash>` -- so a plain
 * caches.match(SHELL_URL) matches nothing and degrades to a plain-text
 * "Offline". matchPrecache resolves the revision itself.
 *
 * WHY THE PRECACHED SHELL IS THE PRIMARY ANSWER, NOT THE NETWORK:
 *
 * An earlier revision of this handler did `await fetch(request)` first and only fell
 * back to the precached shell on failure. That inverted the whole optimisation this app
 * is built around. These are shared kiosk tablets on slow, congested, frequently
 * interrupted lab networks, so a navigation that blocks on the network before
 * considering a cache already on the device costs a full RTT of blank screen on every
 * cold start and hard route entry -- and it had NO timeout, so a link that STALLED
 * rather than errored hung the user indefinitely. `catch` only fires on a thrown
 * error, which is exactly the failure a degraded-but-alive connection does not produce.
 * createHandlerBoundToURL answers from precache in single-digit milliseconds with zero
 * round trips, and the hashed assets it references are already precached.
 *
 * A fresh build still reaches an open tab via the skipWaiting + controllerchange reload
 * at the top of this file: the new worker precaches the new index.html, takes over, and
 * reloads. That is the right place for that concern, not an RTT on every navigation.
 *
 * WHY offline.html IS THE FALLBACK RATHER THAN THE SHELL:
 *
 * Returning index.html when the network is unreachable does NOT give a working app. The
 * SPA boots, then fetches its own lazy route chunks -- /attend/kiosk and /scanner are
 * deliberately NOT in vite.config.js's precache globPatterns -- and lands on the
 * chunk-load error boundary. That is exactly what public/offline.html exists to prevent,
 * and its own header comment says so. offline.html is precached, needs no JavaScript,
 * and paints immediately: the honest "you are offline" answer rather than a broken app
 * that looks briefly functional.
 *
 * The shell is the LAST resort, for a partially-installed worker where even offline.html
 * is missing. Serving something beats the browser's own network-error page.
 */
const NAVIGATION_FALLBACK = async () => {
  const offline = await matchPrecache(OFFLINE_URL);
  if (offline) return offline;
  const shell = await matchPrecache(SHELL_URL);
  if (shell) return shell;
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain" },
  });
};

/*
 * Backstop for the navigation route.
 *
 * setCatchHandler, NOT a second fetch listener -- see the note above on why two
 * responders cannot coexist. It catches whatever the navigation path throws:
 * createHandlerBoundToURL resolves its precache key at REGISTRATION time and throws for
 * a non-precached URL; PrecacheStrategy throws missing-precache-entry if the entry is
 * evicted later; and NetworkFirst throws when a cache write fails under storage
 * pressure. All three would otherwise reject the navigation with a blank screen.
 */
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") return NAVIGATION_FALLBACK();
  return Response.error();
});

registerRoute(
  new NavigationRoute(
    // Cache-first, straight from precache: no network on the navigation path at all.
    createHandlerBoundToURL(SHELL_URL),
    {      denylist: [
        /^\/api\//,
        /\/[^/?]+\.(?:webp|png|jpg|jpeg|svg|ico|json|webmanifest|js|css|html|txt|xml)$/i,
      ],
    }
  ),
  "GET"
);

// Web fonts: immutable per URL, so cache-first with a long expiry is safe.
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-files",
    expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  })
);

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  })
);

// Hashed route chunks and lazy components: where recharts, html5-qrcode and every
// per-tab bundle land now. Fetched on first use, not at install.
//
// `sameOrigin` is checked explicitly. A function matcher is NOT origin-filtered, so
// without it a cross-origin no-cors script (status 0, opaque) would be stored here
// and replayed. The fonts stylesheet only escaped that by luck -- its own rule is
// registered earlier and workbox returns the first match.
registerRoute(
  ({ request, sameOrigin }) =>
    sameOrigin &&
    (request.destination === "script" || request.destination === "style"),
  new StaleWhileRevalidate({
    cacheName: "route-assets",
    expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
    cacheableResponse: { statuses: [0, 200] },
  })
);

// Images and other static media. sameOrigin for the same reason as route-assets.
registerRoute(
  ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "static-assets",
    expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
    cacheableResponse: { statuses: [0, 200] },
  })
);

/*
 * API GETs, so a dropped connection shows the last known data instead of nothing.
 *
 * ── WHY /api/auth/* IS EXCLUDED ────────────────────────────────────────────────
 * /api/auth/profile is not just stale data when wrong, it is a WRONG ROLE.
 * AuthContext commits whatever role comes back, so a cached profile from another
 * account would decide what the current user may see. That route always hits the
 * network, and a failure surfaces as the error it is.
 *
 * ── WHY EVERYTHING ELSE IS PARTITIONED BY IDENTITY ────────────────────────────
 * Workbox's default cache key is the URL ALONE -- the Authorization header is not
 * part of it -- and NetworkFirst serves that cached copy on its 10-second TIMEOUT
 * path, not only when fully offline. On the shared kiosk tablets this app is built
 * around, that is a cross-user data leak: student B signs in on a tablet that
 * student A used, the uplink is slow, and B is served A's /notifications/user.
 *
 * Excluding /api/auth/ alone does NOT fix this. It only removes the role leak. Every
 * other authenticated GET -- /notifications/user, /transactions/borrowed,
 * /attendance/history -- is still user-scoped data served from a URL-only cache, so
 * the leak was mostly closed rather than closed.
 *
 * The fix separates the cache BY IDENTITY instead of dropping offline reads entirely,
 * because a read-only offline shell was an explicit requirement and removing the cache
 * would turn every offline load into an empty page. See getApiStrategy below for why
 * that means a separate BUCKET per identity rather than merely a partitioned key.
 *
 * The identity is HASHED, never stored raw. Putting the bearer token into the cache
 * name would work, but it would write live JWTs into Cache Storage where any
 * same-origin script can enumerate them -- trading a data leak for a token leak.
 * 64 bits of SHA-256 is ample to separate two users' buckets and reveals nothing.
 *
 * Kiosk requests authenticate with a shared X-Kiosk-Token instead, and are bucketed on
 * that, so attendance data cannot be served across kiosk sessions either.
 *
 * Non-GET /api requests are not intercepted, and deliberately so: replaying a queued
 * write is a data-integrity feature, not a caching detail. A replayed attendance
 * time-in has to win exactly once; twice would open a second session. That needs
 * idempotency keys and conflict rules, so the kiosk fails loudly when offline
 * instead -- and the offline banner tells the user why.
 */

/** SHA-256, truncated. Collision-resistance is irrelevant here; separation is not. */
async function identityTag(identity) {
  const bytes = new TextEncoder().encode(identity);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Which identity, if any, a request belongs to. `null` means uncredentialed, which
 * gets the shared bucket -- preserving whatever sharing public endpoints had before.
 */
async function requestIdentityTag(request) {
  const bearer = request.headers.get("Authorization");
  const kiosk = request.headers.get("X-Kiosk-Token");
  if (!bearer && !kiosk) return null;

  // crypto.subtle needs a secure context, and a service worker cannot exist in one,
  // so this is unreachable in practice -- but failing LOUDLY beats silently falling
  // back to an un-partitioned key, which is the exact leak this exists to prevent.
  if (!crypto.subtle) throw new Error("secure context required to partition the api cache");

  return identityTag(bearer ? `auth:${bearer}` : `kiosk:${kiosk}`);
}

/**
 * One NetworkFirst strategy PER IDENTITY, so eviction cannot cross users.
 *
 * WHY NOT ONE SHARED BUCKET WITH PARTITIONED KEYS: the keys were correct, but
 * `maxEntries` is a property of the CACHE, not of the key. CacheExpiration evicts
 * least-recently-used across every entry in the bucket it manages. With a single
 * `api-cache` at 60 entries and a session touching ~6-8 endpoints, one busy student
 * starts deleting an earlier student's offline data partway through the same lab
 * session -- on exactly the shared tablets this app targets. The data never crossed
 * users (that was the leak, now fixed), but the offline fallback quietly stopped
 * working for whoever used the tablet first.
 *
 * Separate buckets give each identity its own eviction budget. That requires building
 * the strategy per request, since `cacheName` is fixed at construction.
 */
const apiStrategies = new Map();

/** Cap on tracked identities. A lab tablet sees a handful; 32 is generous headroom. */
const MAX_TRACKED_IDENTITIES = 32;

function getApiStrategy(tag) {
  const cacheName = tag ? `api-cache-${tag}` : "api-cache-public";
  const existing = apiStrategies.get(cacheName);
  if (existing) {
    // Refresh LRU position.
    apiStrategies.delete(cacheName);
    apiStrategies.set(cacheName, existing);
    return existing;
  }

  const strategy = new NetworkFirst({
    cacheName,
    networkTimeoutSeconds: 10,
    expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
    cacheableResponse: { statuses: [0, 200] },
    // Without this, a QuotaExceededError on write REJECTS the request, turning a full
    // disk into a hard API failure for the user. Purging keeps reads working instead.
    plugins: [{ purgeOnQuotaError: true }],
  });

  apiStrategies.set(cacheName, strategy);

  // Bounded: drop the least-recently-used identity AND delete its cache, so a long-lived
  // worker cannot accumulate buckets (and their response bodies) forever.
  while (apiStrategies.size > MAX_TRACKED_IDENTITIES) {
    const oldest = apiStrategies.keys().next().value;
    apiStrategies.delete(oldest);
    caches.delete(oldest).catch(() => {});
  }

  return strategy;
}

registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/"),
  async ({ request, event }) => {
    const tag = await requestIdentityTag(request);
    return getApiStrategy(tag).handle({ request, event });
  },
  "GET"
);