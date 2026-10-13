/**
 * Tracks whether the data currently on screen came from the service worker's API
 * cache rather than from the network.
 *
 * WHY THIS EXISTS: the /api/* strategy in sw.js is NetworkFirst with a 10 second
 * timeout, so it answers from Cache Storage not only when the device is offline but
 * also when the uplink is merely slow. OfflineBanner cannot cover that case -- it
 * reads navigator.onLine, which stays true on a congested-but-working network -- so
 * a campus tablet that times out on /api/catalog would render inventory quantities
 * up to a day old and present them as current. The worker now stamps every cache hit
 * (X-LabTrack-Served-From); this is where the page reacts to that stamp.
 *
 * ── The clearing rule, stated because it is the security-relevant part ────────
 *
 * The banner is cleared ONLY by a response that actually came from the network.
 * A failed request, an aborted query, and a second cache hit all leave it standing,
 * because none of them are evidence that the data is current. Getting this wrong in
 * the permissive direction would produce exactly the bug this exists to prevent: a
 * banner that flickers away over stale numbers.
 *
 * ── Why a hand-rolled store rather than context ──────────────────────────────
 *
 * api.js is called from query functions, which run outside React, so a value has to
 * be published into something a component can subscribe to. Context would put a
 * provider above the QueryClientProvider and force every consumer to re-render on
 * every API response in the app -- including the several that fire during a route
 * change. A tiny external store read through useSyncExternalStore touches only the
 * one component that displays it, and costs nothing when there is no banner.
 */

import { useSyncExternalStore } from "react";

export const SERVED_FROM_HEADER = "X-LabTrack-Served-From";
export const CACHED_AT_HEADER = "X-LabTrack-Cached-At";

/*
 * Both snapshots carry EXACTLY two fields: `stale` and `cachedAt`. That is all
 * StaleDataBanner reads.
 *
 * There used to be a third, `label`, left over from an earlier draft. It was written
 * here and read nowhere -- and worse, the LIVE snapshot carried `label: "Cached
 * data"`, so anyone inspecting the live value would see it described as cached data.
 * A field nobody reads but that contradicts the one that matters is a trap for the
 * next reader, so it is gone rather than left for someone to "use".
 */
const LIVE = Object.freeze({ stale: false, cachedAt: null });

let snapshot = LIVE;

/*
 * The stale snapshot is MEMOIZED rather than rebuilt per response.
 *
 * publish() bails out when handed the same object it already holds, which is what
 * stops a repeated cache hit from re-rendering the banner. Building a fresh frozen
 * object every time defeated that: two identical cache hits produced two distinct
 * references, so every one of them notified and re-rendered the shell. On a slow
 * link -- precisely when this is happening -- that is many cache hits in a row.
 *
 * Keyed on cachedAt, so a genuinely newer stamp still produces a new snapshot.
 */
let staleSnapshot = null;

const listeners = new Set();

function publish(next) {
  if (next === snapshot) return;
  snapshot = next;

  // Copied before iterating. The hazard is a listener SUBSCRIBING during the
  // notification: Set.forEach visits entries appended while it runs, so a listener
  // that subscribes a new observer would call it immediately and synchronously --
  // inside the update that mounted it. A subscriber that unsubscribing mid-notification
  // is fine on its own; deleting the CURRENT entry during forEach is well defined.
  [...listeners].forEach((listener) => listener());
}

/**
 * Subscription primitive. Exported mainly as a test seam: the identity guarantee above
 * (a notification fires only when the value actually changed) is what keeps the banner
 * from flickering, and it is not observable from the rendered output alone.
 */
export function subscribe(listener) {
  listeners.add(listener);

  // Idempotent, and does not leak Set#delete's boolean return: React can call an
  // unsubscribe more than once under StrictMode's double-invoked effects.
  let released = false;
  return () => {
    if (released) return;
    released = true;
    listeners.delete(listener);
  };
}

/**
 * Turns the worker's CACHED_AT header into something displayable.
 *
 * Returns null for anything unparseable -- a missing header, a proxy that rewrote
 * it, a clock skew that yields a future date. The banner still appears in those
 * cases; it just does not claim an age it cannot substantiate.
 */
function parseCachedAt(raw) {
  if (!raw) return null;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return null;
  // toLocaleTimeString always returns a string, so there is nothing further to validate.
  // An earlier version checked Number.isNaN on this result, which is always false for a
  // string -- a check that could never fail is worse than no check, because it reads
  // like validation that was done.
  return when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Called by api.js for every response.
 *
 * `res` is the raw fetch Response. A missing or unreadable header -- which is what a
 * cross-origin VITE_API_URL without Access-Control-Expose-Headers looks like -- is
 * treated as LIVE. That is the safe direction: the banner is an enhancement, and
 * failing to see the stamp must not mean inventing a stale state the app cannot
 * actually prove.
 */
export function noteResponse(res) {
  let servedFrom = null;
  try {
    servedFrom = res?.headers?.get?.(SERVED_FROM_HEADER) ?? null;
  } catch {
    servedFrom = null;
  }

  if (servedFrom !== "sw-cache") {
    publish(LIVE);
    return;
  }

  let cachedAt = null;
  try {
    cachedAt = parseCachedAt(res.headers.get(CACHED_AT_HEADER));
  } catch {
    cachedAt = null;
  }

  if (!staleSnapshot || staleSnapshot.cachedAt !== cachedAt) {
    staleSnapshot = Object.freeze({ stale: true, cachedAt });
  }
  publish(staleSnapshot);
}

/** Test seam, and the escape hatch for sign-out: forget that anything was cached. */
export function resetCacheStatus() {
  publish(LIVE);
}

/**
 * True while the most recent API response the app saw came from the cache.
 *
 * useSyncExternalStore rather than useState+useEffect so the value cannot be read
 * one render late: tearing between two snapshots in the same commit is exactly the
 * flicker this is meant to eliminate.
 */
export function useStaleApiData() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Test seam: the snapshot currently held, so shape can be asserted. */
export function getSnapshotForTest() {
  return snapshot;
}