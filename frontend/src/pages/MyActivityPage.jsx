import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { MdInbox, MdCheckCircle, MdAssignment, MdEventAvailable, MdWarning } from "react-icons/md";
import PesoIcon from "../components/ui/PesoIcon";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import "../styles/pages/my-activity.css";
import "../styles/pages/tab-strip.css";

/*
 * Each panel is a separate chunk, loaded on first visit.
 *
 * These were all statically imported, so opening /my-activity downloaded every panel
 * at once -- including their stylesheets: FinesTab pulls tabs.css (67 kB) and
 * AttendancePanel pulls attendance.css (37 kB), and tabs.css alone is four times the
 * size of the page's own CSS. That was roughly 140 kB of CSS and five components'
 * worth of JS for a page that opens on `borrowed` and renders exactly one of them.
 *
 * Tabs keep their state per mount, which is unchanged: switching away unmounts a
 * panel either way, and switching back re-fetches rather than showing stale rows --
 * correct for a list of live records, and what already happened.
 */
const TransactionsPanel = lazy(() => import("./activity/TransactionsPanel"));
const RequestsPanel = lazy(() => import("./activity/RequestsPanel"));
const AttendancePanel = lazy(() => import("./activity/AttendancePanel"));
const MyIncidentsPanel = lazy(() => import("./activity/MyIncidentsPanel"));
const FinesTab = lazy(() => import("../components/tabs/FinesTab"));

const TABS = [
  { key: "borrowed", label: "Borrowed", icon: MdInbox },
  { key: "returned", label: "Returned", icon: MdCheckCircle },
  { key: "requests", label: "Requests", icon: MdAssignment },
  { key: "attendance", label: "Attendance", icon: MdEventAvailable },
  { key: "incidents", label: "Incidents", icon: MdWarning },
  { key: "fines", label: "Fines", icon: PesoIcon },
];

const TAB_KEYS = TABS.map((t) => t.key);

export default function MyActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab = TAB_KEYS.includes(requested) ? requested : "borrowed";

  const switchTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === "borrowed") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="my-activity-page">
      <div className="tab-strip" role="tablist" aria-label="My activity">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-strip-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => switchTab(key)}
            type="button"
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tab-strip-panel" role="tabpanel">
        {/*
          One Suspense boundary around whichever panel is active, so switching tabs
          shows a spinner in place while that panel's chunk arrives rather than
          blanking the page.
        */}
        <Suspense
          fallback={
            // LoadingSpinner already renders the .page-loading wrapper, so nesting
            // another one here would double the padding.
            <LoadingSpinner />
          }
        >
          {activeTab === "borrowed" && <TransactionsPanel mode="borrowed" />}
          {activeTab === "returned" && <TransactionsPanel mode="returned" />}
          {activeTab === "requests" && <RequestsPanel />}
          {activeTab === "attendance" && <AttendancePanel />}
          {activeTab === "incidents" && <MyIncidentsPanel />}
          {activeTab === "fines" && <FinesTab />}
        </Suspense>
      </div>
    </div>
  );
}
