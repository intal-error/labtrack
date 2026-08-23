import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { api } from "../../services/api";
import { FiMenu, FiX } from "react-icons/fi";
import {
  MdQrCodeScanner, MdInventory, MdPerson, MdAdminPanelSettings, MdInfo,
  MdLogout, MdDarkMode, MdLightMode, MdHome,
  MdNotifications, MdPeople, MdFolderOpen, MdSettings,
  MdChevronLeft, MdChevronRight, MdExpandMore, MdExpandLess,
  MdBuild, MdWarning, MdMenuBook, MdHistory, MdAssessment, MdAccountCircle,
  MdAttachMoney, MdAssignment
} from "react-icons/md";
import { FaExchangeAlt } from "react-icons/fa";
import "../../styles/pages/layout.css";

const ROLE_LABELS = { student: "Student", faculty: "Faculty", admin: "Admin" };
const ROLE_COLORS = { student: "#1976d2", faculty: "#7b1fa2", admin: "#d32f2f" };

const navSections = [
  {
    label: "HOME",
    items: [
      { path: "/home", label: "Home", icon: MdHome, roles: ["student", "faculty", "admin"] },
      { path: "/usage-logs", label: "My Activity", icon: MdHistory, roles: ["student"] },
      { path: "/reports", label: "Reports", icon: MdAssessment, roles: ["admin"] },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { path: "/scanner", label: "Scan Borrow/Return", icon: MdQrCodeScanner, roles: ["student", "faculty", "admin"] },
      { path: "/transactions", label: "Transactions", icon: FaExchangeAlt, roles: ["student", "faculty", "admin"] },
      { path: "/borrow-requests", label: "Borrow Requests", icon: MdAssignment, roles: ["faculty", "admin"] },
      { path: "/my-requests", label: "My Requests", icon: MdAssignment, roles: ["student"] },
      { path: "/catalog", label: "Catalog", icon: MdInventory, roles: ["faculty", "admin"] },
      { path: "/maintenance", label: "Maintenance", icon: MdBuild, roles: ["admin", "faculty"] },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { path: "/notifications", label: "Notifications", icon: MdNotifications, roles: ["student", "faculty", "admin"] },
      { path: "/incidents", label: "Incidents", icon: MdWarning, roles: ["admin", "faculty", "student"] },
      { path: "/fines", label: "Fines", icon: MdAttachMoney, roles: ["admin", "faculty"] },
      { path: "/manuals", label: "Lab Manuals", icon: MdMenuBook, roles: ["student", "faculty", "admin"] },
      { path: "/members", label: "Members", icon: MdPeople, roles: ["admin"] },
      { path: "/documents", label: "Documents", icon: MdFolderOpen, roles: ["faculty", "admin"] },
      { path: "/settings", label: "Settings", icon: MdSettings, roles: ["admin"] },
    ],
  },
  {
    label: "OTHER",
    items: [
      { path: "/profile", label: "My Profile", icon: MdAccountCircle, roles: ["student", "faculty", "admin"] },
      { path: "/persona", label: "Persona", icon: MdPerson, roles: ["faculty", "admin"] },
      { path: "/admin", label: "Admin", icon: MdAdminPanelSettings, roles: ["admin"] },
      { path: "/about", label: "About", icon: MdInfo, roles: ["student", "faculty", "admin"] },
    ],
  },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(
    Object.fromEntries(navSections.map((s) => [s.label, true]))
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, role, userProfile, logout, loading } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  async function fetchUnreadCount() {
    try {
      const data = await api.getMyNotifications();
      const unread = data.filter((n) => !n.read).length;
      setUnreadCount(unread);
    } catch {
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    if (role) fetchUnreadCount();
  }, [role]);

  useEffect(() => {
    if (location.pathname === "/notifications") {
      fetchUnreadCount();
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
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

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${sidebarOpen ? "active" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-wrap">
            <img className="sidebar-logo-icon" src="/slsulucena.jpg" alt="SLSU" />
            {!collapsed && (
              <div className="sidebar-brand">
                <div className="sidebar-brand-title">LabTrack</div>
                <div className="sidebar-brand-sub">SLSU Lab Equipment</div>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" style={{ background: userProfile?.profileURL ? "transparent" : (ROLE_COLORS[role] || "#F57C00") }}>
            {userProfile?.profileURL ? (
              <img src={userProfile.profileURL} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }} />
            ) : (
              userInitials
            )}
            <span className="user-status-dot" />
          </div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{displayName}</div>
              <span className="sidebar-user-role" style={{ background: `${ROLE_COLORS[role] || "#F57C00"}20`, color: ROLE_COLORS[role] || "#F57C00" }}>
                {ROLE_LABELS[role] || role}
              </span>
            </div>
          )}
        </div>

        <nav>
          <ul>
            {navSections.map((section) => {
              const visibleItems = section.items.filter((item) => item.roles.includes(role));
              if (visibleItems.length === 0) return null;
              const isOpen = openSections[section.label];
              return (
                <li key={section.label} className="nav-section-wrap">
                  <button
                    className={`nav-section ${isOpen ? "open" : ""}`}
                    onClick={() => toggleSection(section.label)}
                  >
                    <span className="nav-section-label">{section.label}</span>
                    {!collapsed && (
                      <span className="nav-section-chevron">
                        {isOpen ? <MdExpandLess size={16} /> : <MdExpandMore size={16} />}
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <ul className={`nav-items ${collapsed ? "collapsed-list" : ""}`}>
                      {visibleItems.map(({ path, label, icon: Icon }) => (
                        <li key={path}>
                          <NavLink
                            to={path}
                            className={({ isActive }) => isActive ? "active" : ""}
                            onClick={() => setSidebarOpen(false)}
                            data-label={label}
                          >
                            <span className="nav-icon"><Icon size={18} /></span>
                            {!collapsed && <span className="nav-label">{label}</span>}
                            {path === "/notifications" && unreadCount > 0 && (
                              <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-bottom-item theme-toggle" onClick={toggleTheme} title={dark ? "Light Mode" : "Dark Mode"} data-label={dark ? "Light Mode" : "Dark Mode"}>
            <span className="nav-icon">{dark ? <MdLightMode size={18} /> : <MdDarkMode size={18} />}</span>
            {!collapsed && <span className="nav-label">{dark ? "Light Mode" : "Dark Mode"}</span>}
          </button>
          <button className="sidebar-bottom-item logout-btn" onClick={handleLogout} title="Logout" data-label="Logout">
            <span className="nav-icon"><MdLogout size={18} /></span>
            {!collapsed && <span className="nav-label">Logout</span>}
          </button>
        </div>

        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <MdChevronRight size={18} /> : <MdChevronLeft size={18} />}
        </button>
      </aside>

      <div className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(false)} />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
