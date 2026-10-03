import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MdMenuBook } from "react-icons/md";
import "../styles/pages/tab-strip.css";

const ManualsTab = lazy(() => import("../components/tabs/ManualsTab"));

// Resources used to carry three sub-tabs (Lab Manuals, Documents, Incidents).
// Incidents became a first-class workflow (staff queue at /incident-reports,
// student tracking under My Activity) and Documents is gone, so Lab Manuals is
// the only tab. `?tab=incidents` still redirects below rather than silently
// landing here, and any other `?tab=` value falls back to manuals.
const ALL_TABS = [
  { key: "manuals", label: "Lab Manuals", icon: MdMenuBook },
];

export default function ResourcesPage() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = ALL_TABS;
  const fallback = tabs[0]?.key || "manuals";

  const requested = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.key === requested) ? requested : fallback;

  const switchTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === fallback) next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  if (requested === "incidents") {
    return <Navigate to={role === "admin" ? "/incident-reports" : "/my-activity?tab=incidents"} replace />;
  }

  return (
    <div className="resources-page">
      {tabs.length > 1 && (
        <div className="tab-strip" role="tablist" aria-label="Lab Manual">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`tab-strip-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => switchTab(key)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tab-strip-panel" role="tabpanel">
        <Suspense fallback={<div className="page-loading"><div className="spinner-lg" /></div>}>
          {activeTab === "manuals" && <ManualsTab />}
        </Suspense>
      </div>
    </div>
  );
}
