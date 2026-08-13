import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { FiMenu, FiX } from "react-icons/fi";
import {
  MdDashboard, MdQrCodeScanner, MdInventory, MdPerson, MdAdminPanelSettings, MdInfo,
  MdLogout, MdDarkMode, MdLightMode, MdTableChart, MdClass, MdAssessment,
  MdNotifications, MdPeople, MdFolderOpen, MdSettings
} from "react-icons/md";
import { FaHandHolding, FaUndoAlt } from "react-icons/fa";
import "../../styles/pages/layout.css";

const ROLE_LABELS = { student: "Student", faculty: "Faculty", admin: "Admin" };
const ROLE_COLORS = { student: "#1976d2", faculty: "#7b1fa2", admin: "#d32f2f" };

const navSections = [
  {
    label: "HOME",
    items: [
      { path: "/overview", label: "Overview", icon: MdDashboard, roles: ["student", "faculty", "admin"] },
      { path: "/records", label: "Records", icon: MdTableChart, roles: ["faculty", "admin"] },
      { path: "/classes", label: "Classes", icon: MdClass, roles: ["faculty", "admin"] },
      { path: "/reports", label: "Reports", icon: MdAssessment, roles: ["faculty", "admin"] },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { path: "/scanner", label: "Scan Borrow/Return", icon: MdQrCodeScanner, roles: ["student", "faculty", "admin"] },
      { path: "/borrowed", label: "Borrowed", icon: FaHandHolding, roles: ["student", "faculty", "admin"] },
      { path: "/returned", label: "Returned", icon: FaUndoAlt, roles: ["student", "faculty", "admin"] },
      { path: "/catalog", label: "Catalog", icon: MdInventory, roles: ["faculty", "admin"] },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { path: "/notifications", label: "Notifications", icon: MdNotifications, roles: ["student", "faculty", "admin"] },
      { path: "/members", label: "Members", icon: MdPeople, roles: ["admin"] },
      { path: "/documents", label: "Documents", icon: MdFolderOpen, roles: ["student", "faculty", "admin"] },
      { path: "/settings", label: "Settings", icon: MdSettings, roles: ["admin"] },
    ],
  },
  {
    label: "OTHER",
    items: [
      { path: "/persona", label: "Persona", icon: MdPerson, roles: ["faculty", "admin"] },
      { path: "/admin", label: "Admin", icon: MdAdminPanelSettings, roles: ["admin"] },
      { path: "/about", label: "About", icon: MdInfo, roles: ["student", "faculty", "admin"] },
    ],
  },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, role, userProfile, logout, loading } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (loading || !role) {
    return (
      <div className="loading-screen">
        <div className="spinner-lg" />
      </div>
    );
  }

  const userInitials = userProfile
    ? `${(userProfile.firstName || "")[0] || ""}${(userProfile.lastName || "")[0] || ""}`.toUpperCase()
    : user?.displayName
      ? user.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
      : user?.email?.[0]?.toUpperCase() || "?";

  const displayName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`
    : user?.displayName || user?.email || "User";

  return (
    <div className="app-layout">
      <button className="burger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <FiX size={22} /> : <FiMenu size={22} />}
      </button>

      <aside className={`sidebar ${sidebarOpen ? "active" : ""}`}>
        <div className="sidebar-logo-wrap">
          <img src="/logo.png" alt="SLSU Logo" className="sidebar-logo" />
          <div className="sidebar-brand">
            <div className="sidebar-brand-title">SLSU LabTrack</div>
            <div className="sidebar-brand-sub">Lab Equipment Tracker</div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" style={{ background: ROLE_COLORS[role] || "#2e7d32" }}>
            {userInitials}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{displayName}</div>
            <div className="sidebar-user-role" style={{ color: ROLE_COLORS[role] || "#2e7d32" }}>
              {ROLE_LABELS[role] || role}
            </div>
          </div>
        </div>

        <nav>
          <ul>
            {navSections.map((section) => {
              const visibleItems = section.items.filter((item) => item.roles.includes(role));
              if (visibleItems.length === 0) return null;
              return (
                <li key={section.label} className="nav-section-wrap">
                  <div className="nav-section">{section.label}</div>
                  <ul>
                    {visibleItems.map(({ path, label, icon: Icon }) => (
                      <li key={path}>
                        <NavLink
                          to={path}
                          className={({ isActive }) => isActive ? "active" : ""}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <span className="nav-icon"><Icon size={18} /></span>
                          <span className="nav-label">{label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-bottom-item" onClick={toggleTheme}>
            <span className="nav-icon">{dark ? <MdLightMode size={18} /> : <MdDarkMode size={18} />}</span>
            <span className="nav-label">{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button className="sidebar-bottom-item" onClick={handleLogout}>
            <span className="nav-icon"><MdLogout size={18} /></span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <div className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(false)} />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
