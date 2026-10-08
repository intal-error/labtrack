/**
 * Route prefetching.
 *
 * WHY THE GATING IS THE INTERESTING PART: this used to fire on every
 * onMouseEnter with no guards, which is wrong in three separate ways.
 *
 *   1. On a touch device there is no hover. The synthetic hover event fires when a
 *      link is tapped, so prefetching raced the navigation it was supposed to
 *      accelerate -- competing for the same connection slot.
 *   2. No priority control. `/attendance` pulls AttendanceLogsPage plus
 *      RoomManagementTab plus five stylesheets (attendance.css alone is 37 kB);
 *      `/resources` pulls ManualsTab plus tabs.css at 67 kB. Sweeping a mouse down
 *      the sidebar downloaded well over a megabyte before any click.
 *   3. The two most-used admin destinations were missing from the map entirely --
 *      /incident-reports and /attend/kiosk -- so exactly the users who needed the
 *      help got none.
 *
 * So: hover-capable pointers only, deferred to idle time so it never competes with
 * a navigation the user is actually performing, and both routes added.
 */

const routePrefetchers = {
  "/dashboard": () => import("../pages/DashboardPage"),
  "/scanner": () => import("../pages/components/ScannerHubPage"),
  "/my-activity": () => import("../pages/MyActivityPage"),
  "/transactions": () => import("../pages/TransactionsPage"),
  "/catalog": () => import("../pages/CatalogPage"),
  "/inventory": () => import("../pages/InventoryPage"),
  "/persona": () => import("../pages/PersonaPage"),
  "/maintenance": () => import("../components/tabs/MaintenanceTab"),
  "/resources": () => import("../pages/ResourcesPage"),
  "/fines": () => import("../components/tabs/FinesTab"),
  "/borrow-requests": () => import("../components/tabs/BorrowRequestsTab"),
  // Was missing. Incident reports are a primary item in the admin sidebar, so the
  // queue staff use all day was the one route with no prefetch.
  "/incident-reports": () => import("../components/tabs/IncidentReportsTab"),
  "/notifications": () => import("../components/tabs/NotificationsTab"),
  "/settings": () => import("../components/tabs/SettingsPage"),
  "/attendance/room": () => import("../pages/RoomAttendancePage"),
  "/attendance": () => import("../pages/AttendanceLogsPage"),
  // Was missing. The kiosk is opened by prefixing the URL at a room door, often on a
  // tablet that has just woken from sleep on a slow link -- exactly where a cold
  // 326 kB QR-scanner chunk is most expensive.
  "/attend/kiosk": () => import("../pages/AttendanceKioskPage"),
};

// Longest first so "/attendance/room" wins over "/attendance".
const sortedPrefetchKeys = Object.keys(routePrefetchers).sort((a, b) => b.length - a.length);

const prefetched = {};

/** Coarse pointer support, computed once and reused; matchMedia is not free. */
const canHover = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(hover: hover) and (pointer: fine)")
  : { matches: false };

function runPrefetch(matcher) {
  // Wrapped so a rejected import (chunk 404 after a deploy mid-session, offline) does
  // not surface as an unhandled rejection. The navigation itself will fail visibly,
  // which is the right place for that error to appear.
  Promise.resolve(routePrefetchers[matcher]()).catch(() => {
    prefetched[matcher] = false;
  });
}

export function prefetchRoute(path) {
  // No hover, no prefetch. Covers touch and also respects a user who has disabled
  // hover effects.
  if (!canHover.matches) return;

  const matcher = sortedPrefetchKeys.find((key) => path.startsWith(key));
  if (!matcher || prefetched[matcher]) return;

  // Marked immediately, before deferring, so a quick double-hover cannot queue two
  // imports of the same chunk.
  prefetched[matcher] = true;

  // Idle time: the fetch should not compete with the navigation the user is in the
  // middle of. The 1500 ms timeout is a ceiling, not a delay -- if the browser is idle
  // it runs on the next free slot.
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => runPrefetch(matcher), { timeout: 1500 });
  } else {
    // Safari before 16.4. A short timeout rather than idle: on a non-idle browser
    // this is still better than nothing, and the chunk is cache-first afterwards.
    setTimeout(() => runPrefetch(matcher), 200);
  }
}

/**
 * Keyboard equivalent of hover.
 *
 * Tabbing through the sidebar is a genuine "about to navigate" signal -- arguably a
 * better one than hover -- and it was not wired up at all, so keyboard users got no
 * prefetch benefit whatsoever.
 */
export function prefetchRouteOnFocus(path) {
  prefetchRoute(path);
}