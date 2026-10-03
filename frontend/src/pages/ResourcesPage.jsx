import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MdMenuBook, MdFolderOpen } from "react-icons/md";
import "../styles/pages/tab-strip.css";

const ManualsTab = lazy(() => import("../components/tabs/ManualsTab"));
const DocumentsTab = lazy(() => import("../components/tabs/DocumentsTab"));

// Incidents used to be a Resources sub-tab. They are now a first-class workflow
// (staff queue at /incident-reports, student tracking under My Activity), so the
// tab is gone and `?tab=incidents` redirects below rather than silently landing
// on Lab Manuals.
const ALL_TABS = [
  { key: "manuals", label: "Lab Manuals", icon: MdMenuBook, roles: ["student", "admin"] },
  { key: "documents", label: "Documents", icon: MdFolderOpen, roles: ["admin"] },
];

export default function ResourcesPage() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = ALL_TABS.filter((tab) => tab.roles.includes(role));
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
      <div className="tab-strip" role="tablist" aria-label="Resources">
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

      <div className="tab-strip-panel" role="tabpanel">
        <Suspense fallback={<div className="page-loading"><div className="spinner-lg" /></div>}>
          {activeTab === "manuals" && <ManualsTab />}
          {activeTab === "documents" && <DocumentsTab />}
        </Suspense>
      </div>
    </div>
  );
}
