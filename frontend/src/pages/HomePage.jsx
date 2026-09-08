import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMyBorrowed, useMyReturned, useDashboardCounts, useChartData, useRecentActivity, useMyNotifications } from "../hooks/useQueries";
import { timeAgo, toDate } from "../utils/helpers";
import {
  MdQrCodeScanner, MdInventory, MdHistory, MdMenuBook,
  MdSwapHoriz, MdAssignment, MdWarning, MdNotificationsNone,
  MdCheckCircle, MdErrorOutline, MdInfoOutline, MdArrowForward,
  MdHomeFilled, MdEventBusy, MdInventory2
} from "react-icons/md";
import "../styles/pages/home.css";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const NOTIF_STYLE = {
  alert: { color: "#d32f2f" },
  overdue: { color: "#d32f2f" },
  warning: { color: "#f57c00" },
  success: { color: "#43A047" },
  info: { color: "#1565c0" },
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user, userProfile, role } = useAuth();
  const isStudent = role === "student";

  const { data: notifData } = useMyNotifications();
  const { data: borrowedData, isLoading: borrowedLoading } = useMyBorrowed();
  const { data: returnedData } = useMyReturned();
  const { data: countsData, isLoading: countsLoading } = useDashboardCounts();
  const { data: chartDataRes, isLoading: chartLoading } = useChartData();
  const { data: activityData } = useRecentActivity();

  const notifs = useMemo(() => notifData || [], [notifData]);
  const mine = useMemo(() => borrowedData || [], [borrowedData]);
  const myReturnedItems = useMemo(() => returnedData || [], [returnedData]);
  const chartData = useMemo(() => chartDataRes || {}, [chartDataRes]);

  const stats = useMemo(() => {
    if (isStudent) {
      const overdue = mine.filter((t) => {
        const d = toDate(t.dueDate);
        return d && d < new Date();
      }).length;
      return [
        { key: "borrowed", label: "Borrowed", value: mine.length, icon: MdHistory, tone: "orange" },
        { key: "overdue", label: "Overdue", value: overdue, icon: MdEventBusy, tone: "red" },
        { key: "returned", label: "Returned", value: myReturnedItems.length, icon: MdCheckCircle, tone: "green" },
      ];
    } else {
      return [
        { key: "inventory", label: "Total Items", value: chartData.inventory ?? 0, icon: MdInventory2, tone: "purple" },
        { key: "available", label: "Available", value: chartData.available ?? 0, icon: MdCheckCircle, tone: "green" },
        { key: "borrowed", label: "Borrowed", value: countsData?.borrowed ?? 0, icon: MdHistory, tone: "orange" },
      ];
    }
  }, [isStudent, mine, myReturnedItems, countsData, chartData]);

  const activity = useMemo(() => {
    if (isStudent) return mine.slice(0, 5);
    return (activityData || []).slice(0, 6);
  }, [isStudent, mine, activityData]);

  const loading = isStudent ? borrowedLoading : (countsLoading || chartLoading);

  const firstName = userProfile?.firstName || user?.displayName?.split(" ")[0] || "there";
  const unreadNotifs = notifs.filter((n) => !n.read);

  const quickActions = isStudent
    ? [
        { label: "Scan to Borrow", desc: "Scan equipment QR", icon: MdQrCodeScanner, path: "/scanner", primary: true },
        { label: "My Requests", desc: "Track borrow requests", icon: MdAssignment, path: "/my-requests" },
        { label: "My Activity", desc: "Borrowed & returned", icon: MdHistory, path: "/usage-logs" },
        { label: "Lab Manuals", desc: "Guides & references", icon: MdMenuBook, path: "/manuals" },
      ]
    : [
        { label: "Catalog", desc: "Manage inventory", icon: MdInventory, path: "/catalog" },
        { label: "Transactions", desc: "View all records", icon: MdSwapHoriz, path: "/transactions" },
        { label: "Borrow Requests", desc: "Review requests", icon: MdAssignment, path: "/borrow-requests" },
      ];

  if (loading) {
    return (
      <div className="home-page">
        <div className="page-loading"><div className="spinner-lg" /></div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <span className="hero-glow hero-glow-1" />
        <span className="hero-glow hero-glow-2" />
        <div className="home-hero-content">
          <span className="hero-eyebrow"><MdHomeFilled size={14} /> LabTrack · SLSU Lucena</span>
          <h1>
            {getGreeting()}, <span className="hero-name">{firstName}</span>
          </h1>
          <p className="hero-date">{formatDate()}</p>
          <div className="hero-actions">
            {!isStudent ? (
              <button className="hero-btn primary" onClick={() => navigate("/catalog")}>
                Browse Catalog <MdArrowForward size={15} />
              </button>
            ) : (
              <>
                <button className="hero-btn primary" onClick={() => navigate("/scanner")}>
                  <MdQrCodeScanner size={16} /> Scan Equipment
                </button>
                <button className="hero-btn ghost" onClick={() => navigate("/manuals")}>
                  Lab Manuals <MdArrowForward size={15} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          <MdQrCodeScanner />
        </div>
      </section>

      <section className="home-actions">
        {quickActions.map(({ label, desc, icon: Icon, path, primary }) => (
          <button key={path} className={`action-tile ${primary ? "primary" : ""}`} onClick={() => navigate(path)}>
            <span className="action-tile-icon"><Icon size={22} /></span>
            <span className="action-tile-text">
              <span className="action-tile-label">{label}</span>
              <span className="action-tile-desc">{desc}</span>
            </span>
            <MdArrowForward size={16} className="action-tile-arrow" />
          </button>
        ))}
      </section>

      <section className="home-stats">
        {stats.map(({ key, label, value, icon: Icon, tone }) => (
          <div className={`home-stat ${tone}`} key={key}>
            <span className="home-stat-icon"><Icon size={20} /></span>
            <div className="home-stat-info">
              <span className="home-stat-value">{value}</span>
              <span className="home-stat-label">{label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="home-sections">
        <div className="home-panel">
          <div className="panel-header">
            <h3>{isStudent ? "My Recent Borrows" : "Recent Activity"}</h3>
            <button className="panel-link" onClick={() => navigate(isStudent ? "/usage-logs" : "/transactions")}>
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="panel-empty">
              <MdInventory size={30} />
              <p>{isStudent ? "You haven't borrowed anything yet" : "No transactions yet"}</p>
              <button onClick={() => navigate(isStudent ? "/scanner" : "/transactions")}>
                {isStudent ? "Scan to borrow" : "Open transactions"}
              </button>
            </div>
          ) : (
            <ul className="activity-feed">
              {(isStudent ? activity : activity).map((item, i) => {
                const due = toDate(item.dueDate);
                const isOverdue = item.action !== "returned" && due && due < new Date();
                return (
                  <li key={item.id || i} className="feed-item">
                    <span className={`feed-dot ${item.action === "returned" ? "returned" : isOverdue ? "overdue" : "borrowed"}`}>
                      {item.action === "returned" ? <MdCheckCircle size={14} /> : isOverdue ? <MdWarning size={14} /> : <MdSwapHoriz size={14} />}
                    </span>
                    <div className="feed-body">
                      <span className="feed-title">{item.itemName || "an item"}{item.quantity > 1 ? ` ×${item.quantity}` : ""}</span>
                      <span className="feed-sub">
                        {isStudent
                          ? item.action === "returned"
                            ? `Returned ${timeAgo(item.returnedAt || item.timestamp)}`
                            : due
                              ? `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                              : timeAgo(item.borrowedAt || item.createdAt)
                          : <>
                              <b>{item.firstName} {item.lastName}</b> {item.action}
                              {item.action === "borrowed" && item.dueDate ? ` · due ${toDate(item.dueDate)?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                            </>
                        }
                      </span>
                    </div>
                    <span className="feed-time">{timeAgo(item.action === "returned" ? (item.returnedAt || item.timestamp) : (item.borrowedAt || item.createdAt || item.timestamp))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="home-panel">
          <div className="panel-header">
            <h3>Announcements</h3>
            <button className="panel-link" onClick={() => navigate("/notifications")}>
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {notifs.length === 0 ? (
            <div className="panel-empty">
              <MdNotificationsNone size={30} />
              <p>No announcements right now</p>
            </div>
          ) : (
            <ul className="notif-list">
              {notifs.slice(0, 4).map((n) => {
                const style = NOTIF_STYLE[n.type] || NOTIF_STYLE.info;
                const Icon = n.type === "success" ? MdCheckCircle : n.type === "info" ? MdInfoOutline : MdErrorOutline;
                return (
                  <li key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => navigate("/notifications")}>
                    <span className="notif-ico" style={{ color: style.color }}><Icon size={17} /></span>
                    <div className="notif-body">
                      <span className="notif-title">{n.title || "Announcement"}</span>
                      <span className="notif-msg">{n.message}</span>
                    </div>
                    {!n.read && <span className="notif-unread-dot" />}
                    <span className="feed-time">{timeAgo(n.createdAt)}</span>
                  </li>
                );
              })}
              {unreadNotifs.length > 4 && (
                <li className="notif-more" onClick={() => navigate("/notifications")}>
                  +{unreadNotifs.length - 4} more unread
                </li>
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
