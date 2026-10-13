import { MdHistory } from "react-icons/md";
import { useStaleApiData } from "../../services/cacheStatus";
import { useOfflineStatus } from "../../hooks/useOfflineStatus";

/**
 * Says, out loud, that what is on screen did not come from the server.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The /api/* route in sw.js is NetworkFirst with a 10 second timeout, so it
 * answers from Cache Storage whenever the network is slow -- not only when the
 * device is offline. OfflineBanner cannot cover that: it reads navigator.onLine,
 * which reports true on a congested-but-working campus link. So a kiosk tablet
 * that timed out on /api/catalog used to render inventory quantities up to 24
 * hours old and present them as current, with nothing on screen saying otherwise.
 *
 * The worker now stamps every cache hit with X-LabTrack-Served-From; this is where
 * the page reacts to that stamp.
 *
 * ── WHY IT STAYS QUIET WHILE GENUINELY OFFLINE ───────────────────────────────
 *
 * OfflineBanner already covers that case, and more forcefully: "You're offline.
 * Pages you've already opened still work. New scans, borrows and returns can't be
 * saved." Two stacked banners would restate it. The whole value of this component
 * is the case OfflineBanner is blind to -- the device thinks it is online and the
 * data is not current -- so that is the only case where it appears.
 *
 * ── WHEN IT CLEARS ───────────────────────────────────────────────────────────
 *
 * Only on a response that actually came from the network. Not on a failed request,
 * not on a second cache hit, not on a timer. See the clearing rule in
 * services/cacheStatus.js.
 */
export default function StaleDataBanner() {
  const { stale, cachedAt } = useStaleApiData();
  const offline = useOfflineStatus();

  if (!stale || offline) return null;

  return (
    <div className="offline-banner is-stale" role="status" aria-live="polite">
      <span className="offline-banner-icon" aria-hidden="true">
        <MdHistory size={18} />
      </span>
      <span className="offline-banner-text">
        <strong>Showing saved data.</strong>{" "}
        {cachedAt ? `Last checked at ${cachedAt}. ` : ""}
        The connection is slow, so these figures may be out of date -- re-check
        before you act on them.
      </span>
    </div>
  );
}