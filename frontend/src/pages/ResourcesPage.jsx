import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MdMenuBook, MdWarning, MdFolderOpen } from "react-icons/md";
import "../styles/pages/tab-strip.css";

const ManualsTab = lazy(() => import("../components/tabs/ManualsTab"));
const IncidentTab = lazy(() => import("../components/tabs/IncidentTab"));
const DocumentsTab = lazy(() => import("../components/tabs/DocumentsTab"));

const ALL_TABS = [
  { key: "manuals", label: "Lab Manuals", icon: MdMenuBook, roles: ["student", "admin"] },
  { key: "incidents", label: "Incidents", icon: MdWarning, roles: ["student", "admin"] },
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
          {activeTab === "incidents" && <IncidentTab />}
          {activeTab === "documents" && <DocumentsTab />}
        </Suspense>
      </div>
    </div>
  );
}
