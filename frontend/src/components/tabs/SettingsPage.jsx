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

const ALL_TABS = [
  { id: "general", label: "General", icon: MdSettings, roles: ["admin"], subtitle: "Manage system preferences and configurations" },
  { id: "profile", label: "Profile", icon: MdAccountCircle, roles: ["student", "admin"], subtitle: "Update your personal information and password" },
  { id: "admin", label: "Admin", icon: MdAdminPanelSettings, roles: ["admin"], subtitle: "Manage admin accounts and permissions" },
  { id: "about", label: "About", icon: MdInfo, roles: ["student", "admin"], subtitle: "System information and version details" },
];

export default function SettingsPage() {
  const { role } = useAuth();
  const tabs = ALL_TABS.filter((t) => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "profile");

  const ActiveComponent =
    activeTab === "general" ? SettingsTab :
    activeTab === "profile" ? ProfilePage :
    activeTab === "admin" ? AdminPage :
    AboutPage;

  const activeTabInfo = ALL_TABS.find(t => t.id === activeTab);

  return (
    <div className="settings-page">
      <div className="settings-tabs-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="settings-tab-panel">
        <ActiveComponent />
      </div>
    </div>
  );
}
