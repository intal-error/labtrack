/**
 * OfflineBanner.
 *
 * Rewritten during the caching work: `navigator.onLine` moved into
 * `useOfflineStatus` (shared with StaleDataBanner) and the reconnection flash moved
 * to React's adjust-state-during-render pattern, because with `offline` owned by the
 * hook there was no longer an event handler in which to co-locate the two state
 * changes and an effect would have been a setState in its own body.
 *
 * That is a rewrite of a component that renders on EVERY page, so the behaviour it had
 * before is pinned here: the offline message, the reconnection flash and its 2.5 s
 * lifetime, and -- the part that was genuinely fiddly -- that going offline cancels a
 * flash that is already counting down rather than letting it fire over the offline
 * banner.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import OfflineBanner from "../src/components/ui/OfflineBanner";
import StaleDataBanner from "../src/components/ui/StaleDataBanner";
import { offlineListenerCount } from "../src/hooks/useOfflineStatus";

function setOnline(online) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OfflineBanner", () => {
  it("renders nothing while online and settled", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("appears with the offline message when the device drops", () => {
    render(<OfflineBanner />);
    setOnline(false);

    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();
    // The wording matters: "changes may not save" is the honest claim, because
    // onLine true is not proof the server is reachable.
    expect(screen.getByText(/can'?t be saved/i)).toBeInTheDocument();
  });

  it("confirms reconnection, then goes away on its own", () => {
    render(<OfflineBanner />);
    setOnline(false);
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();

    setOnline(true);
    expect(screen.getByText(/Back online/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not flash 'Back online' on a first mount while already online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/Back online/i)).toBeNull();
  });

  it("does not flash 'Back online' on a first mount while already offline", () => {
    setOnline(false);
    render(<OfflineBanner />);
    // Offline, not "back online" -- the mount must not read as a transition.
    expect(screen.queryByText(/Back online/i)).toBeNull();
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();
  });

  it("cancels a pending reconnection flash if the device drops again", () => {
    // The edge the adjust-during-render rewrite has to get right: online -> offline ->
    // online starts a 2.5 s timer; going offline inside that window must not leave the
    // flash to fire later over the offline banner.
    render(<OfflineBanner />);
    setOnline(false);
    setOnline(true);
    expect(screen.getByText(/Back online/i)).toBeInTheDocument();

    setOnline(false);
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Still offline, and still saying so.
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();
  });

  it("removes its listeners on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();

    const events = remove.mock.calls.map(([event]) => event);
    expect(events).toContain("offline");
    expect(events).toContain("online");
    remove.mockRestore();
  });
});

describe("useOfflineStatus: one listener pair, however many banners", () => {
  it("attaches the window listeners once for two consumers", () => {
    // Passing a shared `subscribe` to useSyncExternalStore is NOT deduplication:
    // React calls it per instance, so two banners meant two listener pairs while the
    // hook's own comment claimed otherwise.
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    const a = render(<OfflineBanner />);
    const b = render(<StaleDataBanner />);

    const offlineAdds = add.mock.calls.filter(([e]) => e === "offline").length;
    const onlineAdds = add.mock.calls.filter(([e]) => e === "online").length;
    expect(offlineAdds).toBe(1);
    expect(onlineAdds).toBe(1);
    expect(offlineListenerCount()).toBe(2);

    a.unmount();
    b.unmount();

    // Only released once BOTH are gone.
    const offlineRemoves = remove.mock.calls.filter(([e]) => e === "offline").length;
    expect(offlineRemoves).toBe(1);
    expect(offlineListenerCount()).toBe(0);

    add.mockRestore();
    remove.mockRestore();
  });

  it("still reports connectivity to every consumer", () => {
    render(<OfflineBanner />);
    render(<StaleDataBanner />);

    setOnline(false);
    expect(screen.getByText(/You'?re offline/i)).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/i)).toBeNull();

    setOnline(true);
    expect(screen.queryByText(/You'?re offline/i)).toBeNull();
  });
});