/**
 * The cached-vs-live API response store.
 *
 * WHY THIS FILE EXISTS: the /api/* strategy in sw.js is NetworkFirst with a 10 second
 * timeout, so it answers from Cache Storage not only when the device is offline but
 * also when the uplink is merely slow. OfflineBanner cannot report that, because it
 * reads navigator.onLine and that stays true on a congested-but-working network. The
 * worker therefore stamps every cache hit with X-LabTrack-Served-From, and this store
 * is what the page does with it.
 *
 * The behaviour that matters is the CLEARING RULE, and it is a correctness rule rather
 * than a cosmetic one. A banner that disappears while the data behind it is still
 * stale is worse than no banner at all: it tells a student that borrowed-equipment
 * availability is current when it is not. So every test below is about which responses
 * are allowed to take the banner down, not about rendering.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
const cacheStatusApi = await import("../src/services/cacheStatus");
const {
  CACHED_AT_HEADER,
  SERVED_FROM_HEADER,
  noteResponse,
  resetCacheStatus,
  subscribe,
  useStaleApiData,
} = cacheStatusApi;

/** A Response stand-in carrying only what noteResponse is allowed to look at. */
function response({ servedFrom, cachedAt, headersThrow = false } = {}) {
  const map = new Map();
  if (servedFrom !== undefined) map.set(SERVED_FROM_HEADER, servedFrom);
  if (cachedAt !== undefined) map.set(CACHED_AT_HEADER, cachedAt);
  return {
    headers: headersThrow
      ? {
          get(key) {
            if (key === SERVED_FROM_HEADER) throw new Error("cross-origin: header not exposed");
            return map.get(key) ?? null;
          },
        }
      : { get: (key) => map.get(key) ?? null },
  };
}

/** Renders the hook and reports the latest value it produced. */
function read() {
  let seen;
  function Probe() {
    seen = useStaleApiData();
    return null;
  }
  render(<Probe />);
  return () => seen;
}

/**
 * Publishes a response the way api.js does, INSIDE act().
 *
 * useSyncExternalStore schedules the re-render rather than performing it
 * synchronously, so a bare noteResponse() outside act() would leave the probe one
 * render behind -- and every assertion below would read the PREVIOUS state. Wrapping
 * is what makes these tests about the store's logic rather than about React's
 * scheduling.
 */
function emit(res) {
  act(() => {
    noteResponse(res);
  });
}

let current;
beforeEach(() => {
  act(() => {
    act(() => resetCacheStatus());
  });
  current = read();
});

describe("cache status: what counts as stale", () => {
  it("starts live", () => {
    expect(current().stale).toBe(false);
  });

  it("goes stale when the worker says it answered from cache", () => {
    emit(response({ servedFrom: "sw-cache", cachedAt: "2026-01-02T10:00:00Z" }));
    expect(current().stale).toBe(true);
  });

  it("carries the stored time so the UI can say how old the data is", () => {
    emit(response({ servedFrom: "sw-cache", cachedAt: "2026-01-02T10:00:00Z" }));
    expect(typeof current().cachedAt).toBe("string");
    expect(current().cachedAt).not.toBe("");
  });

  it("still goes stale when the stored time is missing", () => {
    // The stamp is what makes the claim; the timestamp only explains it. A response
    // with no Date header is still cached data and must still be disclosed.
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);
    expect(current().cachedAt).toBeNull();
  });

  it("still goes stale when the stored time is unparseable", () => {
    emit(response({ servedFrom: "sw-cache", cachedAt: "not-a-date" }));
    expect(current().stale).toBe(true);
    expect(current().cachedAt).toBeNull();
  });
});

describe("cache status: the clearing rule", () => {
  it("clears on a genuinely live response", () => {
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);

    emit(response({ servedFrom: null }));
    expect(current().stale).toBe(false);
  });

  it("clears on a response with no stamp at all", () => {
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);

    emit(response({}));
    expect(current().stale).toBe(false);
  });

  it("STAYS stale across a second cache hit", () => {
    emit(response({ servedFrom: "sw-cache" }));
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);
  });

  it("is reset by the sign-out path", () => {
    // AuthContext calls resetCacheStatus() on logout so the next account is not shown
    // a banner describing the previous one's session.
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);

    act(() => resetCacheStatus());
    expect(current().stale).toBe(false);
  });

  it("notifies subscribers only when the state actually changes", () => {
    // The identity guarantee: a live response while already live, and a cache hit
    // while already stale, must not re-notify. Without it every API response in the
    // app re-renders the shell.
    let calls = 0;
    const stop = subscribe(() => {
      calls += 1;
    });

    emit(response({}));
    emit(response({}));
    expect(calls).toBe(0);

    emit(response({ servedFrom: "sw-cache" }));
    expect(calls).toBe(1);

    emit(response({ servedFrom: "sw-cache" }));
    expect(calls).toBe(1);

    emit(response({}));
    expect(calls).toBe(2);

    stop();
    emit(response({ servedFrom: "sw-cache" }));
    expect(calls).toBe(2);
  });

  it("does not call a subscriber added during the same notification", () => {
    // Set.forEach visits entries APPENDED while it is running. A listener that
    // subscribes a new observer during a notification would therefore have it called
    // immediately and synchronously -- inside the update that mounted it. Iterating a
    // copy makes the new observer wait for the next publish, which is the correct
    // behaviour.
    const added = [];
    let stopAdded;
    const stopFirst = subscribe(() => {
      if (!stopAdded) stopAdded = subscribe(() => added.push("called"));
    });

    emit(response({ servedFrom: "sw-cache" }));
    expect(added).toEqual([]);

    // ...and it is wired up: the next publish reaches it.
    emit(response({ servedFrom: "sw-cache" }));
    expect(added).toEqual([]); // identical stamp, no new publish

    resetCacheStatus();
    expect(added).toEqual(["called"]);

    stopFirst();
    stopAdded?.();
  });

  it("tolerates unsubscribing twice (StrictMode double-invokes effects)", () => {
    let calls = 0;
    const stop = subscribe(() => {
      calls += 1;
    });

    stop();
    expect(() => stop()).not.toThrow();

    emit(response({ servedFrom: "sw-cache" }));
    expect(calls).toBe(0);
  });

  it("exposes only the two fields the banner reads", () => {
    // A dead `label` field used to sit here -- and the LIVE snapshot carried
    // label: "Cached data", describing live data as cached. Pinned so it cannot creep
    // back in and contradict `stale`.
    const { getSnapshotForTest } = cacheStatusApi;
    emit(response({ servedFrom: "sw-cache", cachedAt: "2026-01-02T10:00:00Z" }));
    expect(Object.keys(getSnapshotForTest()).sort()).toEqual(["cachedAt", "stale"]);

    emit(response({}));
    expect(Object.keys(getSnapshotForTest()).sort()).toEqual(["cachedAt", "stale"]);
    expect(getSnapshotForTest().label).toBeUndefined();
  });
});

describe("cache status: unavailable headers must degrade safely", () => {
  it("treats an unreadable header as LIVE, never as stale", () => {
    // This is what a cross-origin VITE_API_URL without Access-Control-Expose-Headers
    // looks like: fetch() succeeds, the header simply is not readable. Inventing a
    // stale state the app cannot substantiate would be a lie; the banner is an
    // enhancement, so losing it is the correct failure.
    emit(response({ headersThrow: true }));
    expect(current().stale).toBe(false);
  });

  it("a throwing header does not leave a previously-shown banner stuck", () => {
    emit(response({ servedFrom: "sw-cache" }));
    expect(current().stale).toBe(true);

    emit(response({ headersThrow: true }));
    expect(current().stale).toBe(false);
  });

  it("survives a null/undefined response", () => {
    // Defensive: api.js always passes a real Response, but a store that throws here
    // would take down the query that called it.
    expect(() => emit(null)).not.toThrow();
    expect(() => emit(undefined)).not.toThrow();
    expect(() => emit({})).not.toThrow();
    expect(current().stale).toBe(false);
  });

  it("an unreadable CACHED_AT does not suppress the stale state", () => {
    const res = {
      headers: {
        get(key) {
          if (key === SERVED_FROM_HEADER) return "sw-cache";
          throw new Error("not exposed");
        },
      },
    };
    expect(() => emit(res)).not.toThrow();
    expect(current().stale).toBe(true);
    expect(current().cachedAt).toBeNull();
  });
});