import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MdHealthAndSafety } from "react-icons/md";
import "../styles/pages/tab-strip.css";

const SafetyRulesTab = lazy(() => import("../components/tabs/SafetyRulesTab"));

// ManualsTab is NOT imported here any more. The component and the /api/manuals endpoints
// both still exist and are untouched -- retiring the UI is separate from retiring the
// data, and deleting either is a decision that has not been made. See
// docs/migrations/manuals-to-safety-rules-conversion.md.
//
// Resources used to carry three sub-tabs (Lab Manuals, Documents, Incidents).
// Incidents became a first-class workflow, Documents was removed, and Lab Manuals has
// been replaced by Safety Rules. `?tab=incidents` still redirects below rather than
// silently landing here, and any other `?tab=` value falls back to safety-rules.
//
// `?tab=manuals` is handled explicitly for EXISTING BOOKMARKS AND LINKS: it redirects to
// the replacement rather than silently showing Safety Rules under a URL that says
// manuals, so a shared link lands somewhere that explains itself instead of quietly
// changing meaning.
const ALL_TABS = [{ key: "safety-rules", label: "Safety Rules", icon: MdHealthAndSafety }];

export default function ResourcesPage() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = ALL_TABS;
  const fallback = tabs[0]?.key || "safety-rules";

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

  // An old ?tab=manuals link now resolves to the replacement.
  if (requested === "manuals") {
    return <Navigate to="/resources?tab=safety-rules" replace />;
  }

  return (
    <div className="resources-page">
      {tabs.length > 1 && (
        <div className="tab-strip" role="tablist" aria-label="Safety Rules">
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
          {activeTab === "safety-rules" && <SafetyRulesTab />}
        </Suspense>
      </div>
    </div>
  );
}
