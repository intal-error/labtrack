import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  MdSettings, MdAccountCircle, MdAdminPanelSettings, MdInfo,
} from "react-icons/md";

import SettingsTab from "./SettingsTab";
import ProfilePage from "../../pages/ProfilePage";
import AdminPage from "../../pages/AdminPage";
import AboutPage from "../../pages/AboutPage";
import "../../styles/pages/settings-page.css";
import "../../styles/pages/tab-strip.css";

/*
 * superAdminOnly is a THIRD gate, after `roles`.
 *
 * "General" is backed by /api/settings, which is mounted behind requireSuperAdmin
 * because none of its settings have a coherent course-scoped meaning -- a per-course
 * `fine_per_day` or `maintenance_mode` would be four different answers to one
 * question. Leaving the tab on `roles: ["admin"]` therefore gave a Course Admin a
 * button that 403'd on every single read of its panel.
 *
 * "Admin" is deliberately NOT gated the same way: GET /api/admin returns only the
 * caller's own record for a Course Admin, so that tab is genuinely useful to them --
 * it is where they change their own name and password.
 */
const ALL_TABS = [
  { id: "general", label: "General", icon: MdSettings, roles: ["admin"], superAdminOnly: true, subtitle: "Manage system preferences and configurations" },
  { id: "profile", label: "Profile", icon: MdAccountCircle, roles: ["student", "admin"], subtitle: "Update your personal information and password" },
  { id: "admin", label: "Admin", icon: MdAdminPanelSettings, roles: ["admin"], subtitle: "Manage admin accounts and permissions" },
  { id: "about", label: "About", icon: MdInfo, roles: ["student", "admin"], subtitle: "System information and version details" },
];

export default function SettingsPage() {
  const { role, isSuperAdmin } = useAuth();
  const tabs = ALL_TABS.filter(
    (t) => t.roles.includes(role) && (!t.superAdminOnly || isSuperAdmin)
  );
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "profile");

  // activeTab is initialised once, from whatever tabs existed at mount. If the
  // profile resolves after the first render -- or the signed-in account changes --
  // the stored id can name a tab that is no longer in the list, which renders
  // SettingsTab (the default branch) behind a tab strip that does not show it.
  const safeTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id || "profile";

  const ActiveComponent =
    safeTab === "general" ? SettingsTab :
    safeTab === "profile" ? ProfilePage :
    safeTab === "admin" ? AdminPage :
    AboutPage;

  return (
    <div className="settings-page">
      <div className="tab-strip">
        {tabs.map((tab) => (
<button
              key={tab.id}
              className={`tab-strip-btn ${safeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="tab-strip-panel">
        <ActiveComponent />
      </div>
    </div>
  );
}
