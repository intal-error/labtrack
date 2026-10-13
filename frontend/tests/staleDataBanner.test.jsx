/**
 * StaleDataBanner.
 *
 * The banner exists for one failure mode that OfflineBanner structurally cannot see:
 * navigator.onLine is true, the device looks connected, and the response the user is
 * looking at came out of Cache Storage because the uplink timed out. Anything that
 * renders stale inventory quantities as current is worse than the slowness that caused
 * it, so the visibility rules are worth pinning.
 *
 * Two rules are asserted here, and the second is the one that is easy to get wrong:
 *
 *   1. It appears for a cache-served response, and not otherwise.
 *   2. It stays QUIET while genuinely offline, because OfflineBanner already covers
 *      that case in stronger language ("New scans, borrows and returns can't be saved").
 *      Stacking two banners at the top of the viewport would also overlap, since both
 *      are position:fixed at top:0 with no stacking offset between them.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import StaleDataBanner from "../src/components/ui/StaleDataBanner";
import { SERVED_FROM_HEADER, noteResponse, resetCacheStatus } from "../src/services/cacheStatus";

/** Drives navigator.onLine and fires the matching window event. */
function setOnline(online) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

function serveFromCache({ cachedAt } = {}) {
  const headers = new Map([[SERVED_FROM_HEADER, "sw-cache"]]);
  if (cachedAt) headers.set("X-LabTrack-Cached-At", cachedAt);
  act(() => {
    noteResponse({ headers: { get: (k) => headers.get(k) ?? null } });
  });
}

function serveLive() {
  act(() => {
    noteResponse({ headers: { get: () => null } });
  });
}

beforeEach(() => {
  act(() => {
    resetCacheStatus();
  });
  setOnline(true);
});

describe("StaleDataBanner", () => {
  it("renders nothing when every response has been live", () => {
    serveLive();
    render(<StaleDataBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("appears when a response came out of the cache", () => {
    serveFromCache();
    render(<StaleDataBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    // Announced politely: the user should learn the data is old without a screen
    // reader interrupting whatever it was mid-sentence on.
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  it("says the figures may be out of date", () => {
    serveFromCache();
    render(<StaleDataBanner />);
    expect(screen.getByText(/may be out of date/i)).toBeInTheDocument();
  });

  it("shows the stored time when the worker supplied one", () => {
    serveFromCache({ cachedAt: "2026-01-02T10:00:00Z" });
    render(<StaleDataBanner />);
    expect(screen.getByText(/Last checked at/i)).toBeInTheDocument();
  });

  it("still discloses staleness when no time is available", () => {
    serveFromCache();
    render(<StaleDataBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/Last checked at/i)).toBeNull();
  });

  it("clears when a live response arrives", () => {
    serveFromCache();
    render(<StaleDataBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    serveLive();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden while offline, where OfflineBanner does the talking", () => {
    serveFromCache();
    setOnline(false);
    render(<StaleDataBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("returns once the device is back online but the data is still cached", () => {
    serveFromCache();
    setOnline(false);
    render(<StaleDataBanner />);
    expect(screen.queryByRole("status")).toBeNull();

    setOnline(true);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});