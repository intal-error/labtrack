import { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { api } from "../../services/api";
import { useMyNotifications } from "../../hooks/useQueries";
import { prefetchRoute } from "../../App";
import { timeAgo } from "../../utils/helpers";
import { FiMenu, FiX } from "react-icons/fi";
import {
  MdQrCodeScanner, MdInventory, MdPerson, MdInfo,
  MdLogout, MdDarkMode, MdLightMode, MdHome,
  MdNotifications, MdFolderOpen, MdSettings,
  MdChevronLeft, MdChevronRight, MdExpandMore, MdExpandLess,
  MdBuild, MdWarning, MdMenuBook, MdHistory,
  MdAssignment, MdEventAvailable,
  MdSearch, MdClose, MdCheckCircle, MdGavel, MdTune,
} from "react-icons/md";
import PesoIcon from "../ui/PesoIcon";
import { FaExchangeAlt } from "react-icons/fa";
import BottomNav from "./BottomNav";
import "../../styles/pages/layout.css";

const ROUTE_NAMES = {
  "/dashboard": "Dashboard",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/transactions": "Transactions",
  "/catalog": "Catalog",
  "/inventory": "Inventory",
  "/scanner": "Scan Borrow/Return",
  "/borrow-requests": "Borrow Requests",
  "/my-requests": "My Requests",
  "/maintenance": "Maintenance",
  "/incidents": "Incidents",
  "/fines": "Fines",
  "/manuals": "Lab Manuals",
  "/documents": "Documents",
  "/persona": "Persona",
  "/attendance": "Attendance Logs",
  "/attendance-scan": "Scan Attendance",
  "/my-attendance": "My Activity",
  "/usage-logs": "My Activity",
  "/reports": "Reports",
};

const NAV_ITEMS = [
  {
    label: "HOME",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: MdHome, roles: ["student", "admin"] },
    ],
  },
  {
    label: "ATTENDANCE",
    items: [
      { path: "/usage-logs", label: "My Activity", icon: MdHistory, roles: ["student"] },
      { path: "/attendance-scan", label: "Scan Attendance", icon: MdQrCodeScanner, roles: ["student"] },
      { path: "/attendance", label: "Attendance Logs", icon: MdEventAvailable, roles: ["admin"] },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { path: "/scanner", label: "Scan Borrow/Return", icon: MdQrCodeScanner, roles: ["student"] },
      { path: "/transactions", label: "Transactions", icon: FaExchangeAlt, roles: ["student", "admin"] },
      { path: "/borrow-requests", label: "Borrow Requests", icon: MdAssignment, roles: ["admin"] },
      { path: "/my-requests", label: "My Requests", icon: MdAssignment, roles: ["student"] },
      { path: "/inventory", label: "Catalog", icon: MdInventory, roles: ["student"] },
      { path: "/catalog", label: "Catalog", icon: MdInventory, roles: ["admin"] },
      { path: "/maintenance", label: "Maintenance", icon: MdBuild, roles: ["admin"] },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { path: "/notifications", label: "Notifications", icon: MdNotifications, roles: ["student", "admin"] },
      { path: "/incidents", label: "Incidents", icon: MdWarning, roles: ["admin", "student"] },
      { path: "/fines", label: "Fines", icon: PesoIcon, roles: ["student", "admin"] },
      { path: "/manuals", label: "Lab Manuals", icon: MdMenuBook, roles: ["student", "admin"] },
      { path: "/documents", label: "Documents", icon: MdFolderOpen, roles: ["admin"] },
      { path: "/persona", label: "Persona", icon: MdPerson, roles: ["admin"] },
      { path: "/settings", label: "Settings", icon: MdSettings, roles: ["student", "admin"] },
    ],
  },
];

function getNotifIcon(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("borrow") || t.includes("return")) return <MdAssignment size={16} style={{ color: "#43a047" }} />;
  if (t.includes("fine") || t.includes("overdue")) return <MdGavel size={16} style={{ color: "#e53935" }} />;
  if (t.includes("maintenance") || t.includes("repair")) return <MdBuild size={16} style={{ color: "#f57c00" }} />;
  if (t.includes("incident")) return <MdWarning size={16} style={{ color: "#e53935" }} />;
  if (t.includes("attendance")) return <MdEventAvailable size={16} style={{ color: "#1976d2" }} />;
  if (t.includes("approved")) return <MdCheckCircle size={16} style={{ color: "#43a047" }} />;
  if (t.includes("reject")) return <MdClose size={16} style={{ color: "#e53935" }} />;
  return <MdInfo size={16} style={{ color: "#43a047" }} />;
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(
    Object.fromEntries(NAV_ITEMS.map((s) => [s.label, true]))
  );
  const [logbookActive, setLogbookActive] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const notifRef = useRef(null);
  const userRef = useRef(null);
  const { user, role, userProfile, logout, loading } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const notifData = useMyNotifications();
  const rawNotifs = notifData?.data;
  const notifications = Array.isArray(rawNotifs) ? rawNotifs : Array.isArray(rawNotifs?.data) ? rawNotifs.data : [];
  const unreadNotifications = notifications.filter((n) => !n?.read);
  const unreadCount = unreadNotifications.length;

  const pageTitle = ROUTE_NAMES[location.pathname] || "Dashboard";

  const firstName = (userProfile?.name || userProfile?.firstName || "User").split(" ")[0];
  const initials = userProfile?.name
    ? userProfile.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  async function fetchLogbookStatus() {
    try {
      if (!userProfile?.schoolId) return;
      const data = await api.getStudentAttendance(userProfile.schoolId);
      const hasActive = (data.records || []).some((r) => r.status === "active");
      setLogbookActive(hasActive);
    } catch {
      setLogbookActive(false);
    }
  }

  useEffect(() => {
    if (role === "student" && userProfile?.schoolId) {
      fetchLogbookStatus();
    }
  }, [role, userProfile?.schoolId]);

  const handleLogout = async () => {
    setUserOpen(false);
    await logout();
    navigate("/login");
  };

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const path = role === "admin" ? "/catalog" : "/my-requests";
      navigate(`${path}?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      if (notifData?.refetch) notifData.refetch();
    } catch {
      console.error("Failed to mark all notifications as read");
    }
  };

  const handleNotifClick = useCallback(() => {
    setNotifOpen((o) => {
      if (!o) setUserOpen(false);
      return !o;
    });
  }, []);

  const handleUserClick = useCallback(() => {
    setUserOpen((o) => {
      if (!o) setNotifOpen(false);
      return !o;
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    }
    function handleEscape(e) {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (loading || !role) {
    return (
      <div className="loading-screen">
        <div className="spinner-lg" />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${sidebarOpen ? "active" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-wrap">
            <img className="sidebar-logo-icon" src="/logo.png" alt="SLSU" loading="lazy" width="40" height="40" decoding="async" />
            {!collapsed && (
              <div className="sidebar-brand">
                <div className="sidebar-brand-title">LabTrack</div>
                <div className="sidebar-brand-sub">SLSU Lab Equipment</div>
              </div>
            )}
          </div>
        </div>

        <nav>
          <ul>
            {NAV_ITEMS.map((section) => {
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
                            onMouseEnter={() => prefetchRoute(path)}
                            data-label={label}
                          >
                            <span className="nav-icon"><Icon size={18} /></span>
                            {!collapsed && <span className="nav-label">{label}</span>}
                            {path === "/attendance-scan" && !collapsed && (
                              <span className={`logbook-dot ${logbookActive ? "active" : ""}`} />
                            )}
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

      <div className="main-wrap">
        <header className="dash-header">
          <button className="burger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>
          <div className="dash-header-left">
            <h1 className="dash-header-title">{pageTitle}</h1>
            <span className="dash-header-date">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <form className="dash-header-search" onSubmit={handleSearch}>
            <MdSearch size={18} />
            <input
              type="text"
              placeholder="Search anything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>

          <div className="dash-header-right">
            <div className="dash-header-bell-wrap" ref={notifRef}>
              <button className="dash-bell" onClick={handleNotifClick} title="Notifications">
                <MdNotifications size={20} />
                {unreadCount > 0 && <span className="dash-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>

              {notifOpen && (
                <div className="dash-notif-dropdown">
                  <div className="dash-dd-header">
                    <h4>Notifications {unreadNotifications.length > 0 && <span className="dash-dd-count">{unreadNotifications.length}</span>}</h4>
                    {unreadNotifications.length > 0 && (
                      <button className="dash-dd-mark-read" onClick={handleMarkAllRead}>Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="dash-dd-empty">
                      <MdNotifications size={36} />
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    <ul className="dash-dd-list">
                      {notifications.slice(0, 8).map((notif, idx) => (
                        <li key={notif?.id || `notif-${idx}`} className={`dash-dd-item ${notif?.read ? "" : "unread"}`} onClick={() => { setNotifOpen(false); navigate("/notifications"); }}>
                          <div className="dash-dd-item-icon">{getNotifIcon(notif?.title)}</div>
                          <div className="dash-dd-item-body">
                            <div className="dash-dd-item-title">{notif?.title || "Notification"}</div>
                            <div className="dash-dd-item-msg">{notif?.message || ""}</div>
                          </div>
                          <span className="dash-dd-item-time">{timeAgo(notif?.createdAt || notif?.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="dash-dd-footer">
                    <button onClick={() => { setNotifOpen(false); navigate("/notifications"); }}>View All Notifications</button>
                  </div>
                </div>
              )}
            </div>

            <div className="dash-header-user" ref={userRef} onClick={handleUserClick}>
              <div className="dash-header-user-info">
                <span className="dash-header-user-name">{userProfile?.name || firstName}</span>
                <span className="dash-header-user-role">{role === "admin" ? "Administrator" : "Student"}</span>
              </div>
              <div className={`dash-header-avatar ${role}`}>{initials}</div>

              {userOpen && (
                <div className="dash-user-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="dash-ud-profile">
                    <div className={`dash-ud-avatar ${role}`}>{initials}</div>
                    <div className="dash-ud-name">{userProfile?.name || firstName}</div>
                    {userProfile?.email && <div className="dash-ud-email">{userProfile.email}</div>}
                    <span className={`dash-ud-role ${role}`}>{role === "admin" ? "Administrator" : "Student"}</span>
                  </div>
                  <div className="dash-ud-menu">
                    <button className="dash-ud-menu-item" onClick={() => { setUserOpen(false); navigate("/settings"); }}>
                      <MdTune size={18} /> Settings
                    </button>
                    <button className="dash-ud-menu-item danger" onClick={handleLogout}>
                      <MdLogout size={18} /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
