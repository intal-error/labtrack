import { useEffect, useState } from "react";
import { MdCloudOff, MdCheckCircle } from "react-icons/md";

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
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false
  );
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOffline(true);
      setJustReconnected(false);
    };
    const goOnline = () => {
      setOffline(false);
      // Brief confirmation, then nothing. A permanent "back online" chip is noise;
      // this only exists so the user knows to retry the action that just failed.
      setJustReconnected(true);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    let timer = null;
    if (!offline && justReconnected) {
      timer = setTimeout(() => setJustReconnected(false), 2500);
    }

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearTimeout(timer);
    };
  }, [offline, justReconnected]);

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