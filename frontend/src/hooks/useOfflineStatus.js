/**
 * Shared `navigator.onLine` tracking.
 *
 * ── WHY IT IS ITS OWN HOOK ───────────────────────────────────────────────────
 *
 * Two banners read this state: OfflineBanner has always, and StaleDataBanner needs it
 * only to stay out of the way. Without a shared hook the second one would be a
 * verbatim copy of the first, and a verbatim copy is the kind of thing that survives
 * long after the reason for it has gone.
 *
 * ── WHY THE LISTENERS ARE DEDUPED HERE AND NOT RELIED ON FROM THE CALLER ─────
 *
 * Passing one shared `subscribe` function to `useSyncExternalStore` is NOT enough to
 * deduplicate: React calls `subscribe` once per component instance, so two banners
 * still mean two addEventListener pairs for the life of the tab. The first version of
 * this file did exactly that while its own comment claimed otherwise.
 *
 * So `subscribe` keeps a module-level subscriber set and attaches the window
 * listeners only while that set is non-empty. Two banners, one listener pair; zero
 * banners, no listeners at all.
 *
 * ── WHY useSyncExternalStore AND NOT useState + useEffect ────────────────────
 *
 * navigator.onLine is an external store, and this is the API that reads one correctly.
 * It subscribes and re-reads the snapshot immediately after attaching, which closes the
 * gap a lazy useState initialiser leaves open -- the device can change state between
 * the initialiser running and the effect attaching, and the events in that window are
 * simply lost.
 *
 * It also avoids the setState-inside-an-effect pattern that costs an extra render pass
 * per transition, which on a phone flipping between Wi-Fi and mobile data is a
 * repeated cost rather than a theoretical one.
 *
 * NOTE FOR THE NEXT PERSON: do not replace this with React's adjust-state-during-
 * render pattern. That was tried, and it does not work here -- a render-phase update
 * makes React re-enter the component, the store's snapshot-consistency check then sees
 * no change, and the re-render is silently dropped. See OfflineBanner.jsx.
 */

import { useSyncExternalStore } from "react";

const subscribers = new Set();

function handleStoreChange() {
  // Copy before iterating: a subscriber that unsubscribes during the notification
  // (React does exactly this when a component unmounts) would otherwise mutate the set
  // mid-iteration.
  [...subscribers].forEach((notify) => notify());
}

function subscribe(onStoreChange) {
  subscribers.add(onStoreChange);

  if (subscribers.size === 1) {
    window.addEventListener("offline", handleStoreChange);
    window.addEventListener("online", handleStoreChange);
  }

  let released = false;
  return () => {
    // Idempotent, because React can call the unsubscribe function more than once
    // under StrictMode's double-invoked effects.
    if (released) return;
    released = true;
    subscribers.delete(onStoreChange);

    if (subscribers.size === 0) {
      window.removeEventListener("offline", handleStoreChange);
      window.removeEventListener("online", handleStoreChange);
    }
  };
}

// A fresh boolean primitive per call is fine -- getSnapshot is compared with Object.is.
// A fresh OBJECT would not be, and would loop.
const getSnapshot = () => navigator.onLine === false;

// Server/prerender snapshot: assume online. Nothing reads this in the app today, but
// returning a constant rather than touching `navigator` keeps the hook safe if it is
// ever rendered outside a browser.
const getServerSnapshot = () => false;

/** How many window listeners are currently attached. Test seam. */
export function offlineListenerCount() {
  return subscribers.size;
}

export function useOfflineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}