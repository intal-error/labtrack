import { useEffect, useRef, useState } from "react";
import { MdCloudOff, MdCheckCircle } from "react-icons/md";
import { useOfflineStatus } from "../../hooks/useOfflineStatus";

/**
 * Offline / reconnection indicator.
 *
 * WHY IT LIVES IN APP.JSX RATHER THAN DashboardLayout: the kiosk
 * (/attend/kiosk) and the login page sit outside the layout, and an offline
 * student at the kiosk is exactly who needs to know the next scan will fail
 * before they point the camera at a QR code.
 *
 * WHY IT USES navigator.onLine RATHER THAN A REAL PROBE: a health check on
 * mount would be one extra request per page load to learn something the browser
 * already tracks, and the value goes stale instantly anyway. onLine false is
 * trustworthy (no interface). onLine true is not proof the server is reachable --
 * campus Wi-Fi with no uplink reports true -- which is why the banner says
 * "changes may not save", not "you are online".
 *
 * That last point is also why this banner is NOT enough on its own: onLine true
 * with a dead or crawling uplink is precisely the case where StaleDataBanner has
 * to speak up, because this one stays silent and the data on screen is stale.
 */
export default function OfflineBanner() {
  const offline = useOfflineStatus();
  const [justReconnected, setJustReconnected] = useState(false);

  /*
   * The "back online" flash, driven by an EDGE on `offline`.
   *
   * ── WHY AN EFFECT AND NOT React's adjust-state-during-render ────────────────
   *
   * Adjusting state during render is the documented pattern for deriving one piece of
   * state from another during render, and it was tried here first. It does not work
   * with `useSyncExternalStore`: the render-phase update makes React re-enter the
   * component, the store's snapshot-consistency check then sees no change and the
   * re-render is dropped. Empirically the component never re-rendered on the
   * online transition at all, so the flash silently stopped appearing -- verified by
   * logging every render, and pinned by tests/offlineBanner.test.jsx.
   *
   * ── WHY THE EDGE, NOT A PLAIN `if (!offline)` ───────────────────────────────
   *
   * `offline` is false on first mount for every user who is online, so an effect with
   * no edge detection flashes "Back online" to every normal visitor on every page
   * load. The ref records the previous value so the effect body only runs for an
   * actual transition, and it is seeded from the live value so the mount case never
   * fires.
   *
   * The setState below is what react-hooks/set-state-in-effect warns about. The
   * warning is real in general -- an unconditional setState in an effect causes a
   * cascading render -- and the alternatives were measured to be wrong (see above) or
   * to duplicate the listener pair. It does not fire here because the effect body is
   * guarded by an edge check and so runs at most once per connectivity change, but the
   * reasoning above is why the guard exists rather than the rule being the reason.
   */
  const wasOfflineRef = useRef(offline);
  useEffect(() => {
    if (offline === wasOfflineRef.current) return;
    wasOfflineRef.current = offline;

    // Going offline cancels a flash that is already counting down, so it cannot
    // reappear later over the offline banner.
    setJustReconnected(!offline);
  }, [offline]);

  // Dismissal timer. Lives in its own effect so the state change above is not
  // entangled with the cleanup, and `setState` here is inside a timeout callback
  // rather than the effect body, so it is not the flagged pattern.
  useEffect(() => {
    if (!justReconnected) return undefined;
    const timer = setTimeout(() => setJustReconnected(false), 2500);
    return () => clearTimeout(timer);
  }, [justReconnected]);

  if (!offline && !justReconnected) return null;

  return (
    <div
      className={`offline-banner ${offline ? "is-offline" : "is-online"}`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-banner-icon" aria-hidden="true">
        {offline ? <MdCloudOff size={18} /> : <MdCheckCircle size={18} />}
      </span>
      <span className="offline-banner-text">
        {offline ? (
          <>
            <strong>You&apos;re offline.</strong> Pages you&apos;ve already opened still work.
            New scans, borrows and returns can&apos;t be saved until the connection is back.
          </>
        ) : (
          "Back online. You can retry."
        )}
      </span>
    </div>
  );
}