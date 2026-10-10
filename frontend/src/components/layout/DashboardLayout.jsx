import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { api } from "../../services/api";
import ProfileGate from "../ui/ProfileGate";
import { useMyNotifications, pickNotifications, useUnreadCount, useStudentAttendance } from "../../hooks/useQueries";
import { prefetchRoute } from "../../utils/prefetchRoute";
import { timeAgo } from "../../utils/helpers";
import { FiMenu, FiX } from "react-icons/fi";
import {
  MdQrCodeScanner, MdInventory, MdPerson, MdInfo,
  MdLogout, MdDarkMode, MdLightMode, MdHome,
  MdNotifications, MdSettings,
  MdChevronLeft, MdChevronRight, MdExpandMore, MdExpandLess,
  MdBuild, MdWarning, MdMenuBook, MdHistory,
  MdAssignment, MdEventAvailable,
  MdClose, MdCheckCircle, MdGavel, MdTune,
} from "react-icons/md";
import PesoIcon from "../ui/PesoIcon";
import { FaExchangeAlt } from "react-icons/fa";
import BottomNav from "./BottomNav";
import "../../styles/pages/layout.css";

const ROUTE_NAMES = {
  "/dashboard": "Dashboard",
  "/my-activity": "My Activity",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/transactions": "Transactions",
  "/catalog": "Catalog",
  "/inventory": "Equipment Catalog",
  "/scanner": "Scanner",
  "/borrow-requests": "Borrow Requests",
  "/incident-reports": "Incident Reports",
  "/maintenance": "Maintenance",
  "/resources": "Lab Manual",
  "/fines": "Fines",
  "/persona": "Persona",
  "/students": "Students",
  "/attendance": "Attendance Logs",
};

/*
 * `now` wins over the static map because the header shows which COURSE the admin is
 * scoped to, and that is the one piece of context that decides whether the numbers on
 * the dashboard are the whole school or just one program. Getting it wrong in either
 * direction is bad: hiding it leaves a Course Admin wondering why their class has
 * thirty students, and showing it to nobody makes every dashboard look school-wide.
 */
function resolvePageTitle(pathname, now) {
  const base = ROUTE_NAMES[pathname]
    || (pathname.startsWith("/attendance/room/") ? "Room Attendance" : "Dashboard");
  return now ? `${now} · ${base}` : base;
}

/*
 * Nav entries are filtered by `roles` only. Course visibility is NOT a second
 * dimension here: every admin page is course-scoped on the server, so one nav item
 * serves all nine courses. Adding a per-course nav would duplicate the whole tree
 * nine times for no behavioural difference.
 */
const NAV_ITEMS = [
  {
    label: "OVERVIEW",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: MdHome, roles: ["student", "admin"] },
      { path: "/my-activity", label: "My Activity", icon: MdHistory, roles: ["student"] },
    ],
  },
  {
    label: "LAB",
    roles: ["student"],
    items: [
      { path: "/scanner", label: "Scanner", icon: MdQrCodeScanner, roles: ["student"] },
      { path: "/inventory", label: "Equipment Catalog", icon: MdInventory, roles: ["student"] },
      { path: "/resources", label: "Lab Manual", icon: MdMenuBook, roles: ["student"] },
    ],
  },
  {
    label: "OPERATIONS",
    roles: ["admin"],
    items: [
      { path: "/transactions", label: "Transactions", icon: FaExchangeAlt, roles: ["admin"] },
      { path: "/borrow-requests", label: "Borrow Requests", icon: MdAssignment, roles: ["admin"] },
      { path: "/incident-reports", label: "Incident Reports", icon: MdWarning, roles: ["admin"] },
      { path: "/catalog", label: "Catalog", icon: MdInventory, roles: ["admin"] },
      { path: "/maintenance", label: "Maintenance", icon: MdBuild, roles: ["admin"] },
      { path: "/attendance", label: "Attendance Logs", icon: MdEventAvailable, roles: ["admin"] },
    ],
  },
  {
    label: "MANAGEMENT",
    roles: ["admin"],
    items: [
      { path: "/students", label: "Students", icon: MdPerson, roles: ["admin"] },
      { path: "/resources", label: "Lab Manual", icon: MdMenuBook, roles: ["admin"] },
      { path: "/fines", label: "Fines", icon: PesoIcon, roles: ["admin"] },
      { path: "/persona", label: "Persona", icon: MdPerson, roles: ["admin"] },
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
  // logbookActive is no longer state -- it is derived from useStudentAttendance
  // below, which removed both this setter and a duplicate network call.
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);
  const contentRef = useRef(null);
  const { user, role, userProfile, logout, loading, profileError, refreshProfile, isSuperAdmin, isCourseAdmin, courseName, courseId } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const notifData = useMyNotifications();
  const notifications = pickNotifications(notifData?.data);
  const unreadCount = useUnreadCount();

  // The course badge. A Course Admin sees their program in every page title; a Super
  // Admin sees "All Courses", which is the honest description of what they can reach.
  // Legacy admins (no adminLevel) are treated as super, matching middleware/courseScope
  // -- if the two disagreed, the badge would claim a narrower scope than the data has.
  const courseBadge = isCourseAdmin ? (courseName || courseId) : isSuperAdmin ? "All Courses" : null;

  const pageTitle = resolvePageTitle(location.pathname, courseBadge);

  const firstName = (userProfile?.name || userProfile?.firstName || "User").split(" ")[0];
  const initials = userProfile?.name
    ? userProfile.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  /*
   * Reset the scroll position on every navigation.
   *
   * .main-content is the scroll container, not the window (overflow-y: auto in
   * layout.css), and nothing ever reset its offset -- a grep across src for
   * scrollTo / scrollTop / ScrollRestoration returns nothing. So: scroll to row 40
   * of the attendance table, tap "My Activity" in the bottom nav, and you land
   * 2000px down a page 800px tall, often on blank space with the tab strip off
   * screen. It looks like a rendering bug rather than a missing reset.
   *
   * useLayoutEffect rather than useEffect so the reset lands in the same frame as
   * the new route's paint. With useEffect the browser paints the new page at the old
   * offset first, which is a visible flash on slow connections.
   *
   * "instant" beats behavior: "auto" would inherit the CSS scroll-behavior: smooth
   * from global.css:174 and animate the jump.
   */
  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  /*
   * Was a raw api.getStudentAttendance() call here.
   *
   * Two problems, both fixed by using the hook instead:
   *   1. It bypassed react-query entirely -- no cache, no dedupe, no staleTime --
   *      so it refetched on every DashboardLayout mount.
   *   2. DashboardPage calls useStudentAttendance(schoolId) with the SAME key.
   *      Because this one bypassed the cache, a student's dashboard load issued two
   *      identical GET /attendance/my/:schoolId requests in parallel, and each
   *      surface that mounted the hook later fetched a third time.
   *
   * useStudentAttendance is keyed ["studentAttendance", schoolId] with a 2-minute
   * staleTime and is already shared with DashboardPage and AttendancePanel, so this
   * now reads from the cache the first time and reuses it after.
   */
  const { data: attendanceData } = useStudentAttendance(
    role === "student" ? userProfile?.schoolId : null
  );
  const logbookActive = useMemo(
    () => (attendanceData?.records || []).some((r) => r.status === "active"),
    [attendanceData]
  );

  const handleLogout = async () => {
    setUserOpen(false);
    await logout();
    navigate("/login");
  };

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
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

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner-lg" />
      </div>
    );
  }

  /*
   * Authenticated but no role -- the profile lookup failed.
   *
   * This was folded into `if (loading || !role)` above, which meant a failed
   * getProfile() produced a FULL-SCREEN SPINNER with no sidebar. So no logout
   * button, no explanation, no retry: the only escape was a full page reload, which
   * would fail the same way. On a flaky campus network that locked people out of
   * the app entirely.
   *
   * ProfileGate renders the message, a retry when retrying can help, and always a
   * sign-out. It must stay ABOVE the layout so the sidebar never has to render for
   * a user whose role we do not know.
   */
  if (!role) {
    return <ProfileGate error={profileError} onRetry={refreshProfile} onSignOut={handleLogout} />;
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${sidebarOpen ? "active" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-wrap">
            <img className="sidebar-logo-icon" src="/icons/icon-192x192.png" alt="SLSU" loading="lazy" width="40" height="40" decoding="async" />
            {!collapsed && (
              <div className="sidebar-brand">
                <div className="sidebar-brand-title">LabTrack</div>
                <div className="sidebar-brand-sub">Borrowing, Return & Attendance</div>
              </div>
            )}
          </div>
        </div>

        <nav>
          <ul>
            {NAV_ITEMS.map((section) => {
              if (section.roles && !section.roles.includes(role)) return null;
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
          onFocus={() => prefetchRoute(path)}
                            data-label={label}
                          >
                            <span className="nav-icon"><Icon size={18} /></span>
                            {!collapsed && <span className="nav-label">{label}</span>}
                            {path === "/scanner" && !collapsed && (
                              <span className={`logbook-dot ${logbookActive ? "active" : ""}`} />
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
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-bottom-item settings-btn ${isActive ? "active" : ""}`}
            onClick={() => setSidebarOpen(false)}
            data-label="Settings"
          >
            <span className="nav-icon"><MdSettings size={18} /></span>
            {!collapsed && <span className="nav-label">Settings</span>}
          </NavLink>
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

          <div className="dash-header-right">
            <div className="dash-header-bell-wrap" ref={notifRef}>
              <button className="dash-bell" onClick={handleNotifClick} title="Notifications">
                <MdNotifications size={20} />
                {unreadCount > 0 && <span className="dash-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>

              {notifOpen && (
                <div className="dash-notif-dropdown">
                  <div className="dash-dd-header">
                    <h4>Notifications {unreadCount > 0 && <span className="dash-dd-count">{unreadCount}</span>}</h4>
                    {unreadCount > 0 && (
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

        <main className="main-content" ref={contentRef}>
          <Suspense
            fallback={
              // Fixed height so the surrounding layout does not collapse and
              // reflow while a route chunk loads, which is what turned every
              // navigation into a visible jump.
              <div className="page-loading"><div className="spinner-lg" /></div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
