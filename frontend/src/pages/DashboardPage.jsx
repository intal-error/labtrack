import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useMyBorrowed,
  useMyReturned,
  useMyBorrowRequests,
  useBorrowRequests,
  useReportSummary,
  useMyNotifications,
  useMyFines,
} from "../hooks/useQueries";
import { toDate } from "../utils/helpers";
import {
  MdQrCodeScanner,
  MdInventory,
  MdHistory,
  MdMenuBook,
  MdSwapHoriz,
  MdAssignment,
  MdWarning,
  MdNotifications,
  MdCheckCircle,
  MdErrorOutline,
  MdInfoOutline,
  MdArrowForward,
  MdEventBusy,
  MdInventory2,
  MdPeople,
  MdEventAvailable,
  MdBuild,
  MdNotificationsActive,
  MdAttachMoney,
} from "react-icons/md";
import "../styles/pages/dashboard.css";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatShortDate(date) {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NOTIF_ICONS = {
  success: MdCheckCircle,
  alert: MdErrorOutline,
  overdue: MdWarning,
  warning: MdWarning,
  info: MdInfoOutline,
};

const NOTIF_COLORS = {
  success: "#43A047",
  alert: "#d32f2f",
  overdue: "#d32f2f",
  warning: "#f57c00",
  info: "#1565c0",
};

function LoadingState() {
  return (
    <div className="dash-page">
      <div className="page-loading">
        <div className="spinner-lg" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                   STUDENT DASHBOARD            */
/* ═══════════════════════════════════════════════ */
function StudentDashboard() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const firstName =
    userProfile?.firstName ||
    user?.displayName?.split(" ")[0] ||
    "there";

  const { data: borrowedData, isLoading: borrowedLoading } = useMyBorrowed();
  const { data: returnedData } = useMyReturned();
  const { data: notifData } = useMyNotifications();
  const { data: myRequestsData } = useMyBorrowRequests();
  const { data: finesData } = useMyFines();

  const borrowed = useMemo(() => borrowedData || [], [borrowedData]);
  const returned = useMemo(() => returnedData || [], [returnedData]);
  const notifs = useMemo(() => {
    if (!notifData) return [];
    const raw = notifData?.data;
    return Array.isArray(raw) ? raw : Array.isArray(notifData) ? notifData : [];
  }, [notifData]);
  const myRequests = useMemo(() => myRequestsData || [], [myRequestsData]);
  const fines = useMemo(() => finesData || [], [finesData]);

  const overdueItems = useMemo(() => {
    const now = new Date();
    return borrowed.filter((t) => {
      const d = toDate(t.dueDate);
      return d && d < now;
    });
  }, [borrowed]);

  const pendingRequests = useMemo(
    () => myRequests.filter((r) => r.status === "pending"),
    [myRequests]
  );

  const unpaidFines = useMemo(
    () => fines.filter((f) => f.status === "unpaid"),
    [fines]
  );

  const stats = [
    {
      key: "borrowed",
      label: "My Borrowings",
      value: borrowed.length,
      icon: MdHistory,
      tone: "orange",
    },
    {
      key: "overdue",
      label: "Overdue Items",
      value: overdueItems.length,
      icon: MdEventBusy,
      tone: "red",
    },
    {
      key: "requests",
      label: "Pending Requests",
      value: pendingRequests.length,
      icon: MdAssignment,
      tone: "amber",
    },
    {
      key: "fines",
      label: "Unpaid Fines",
      value: unpaidFines.length,
      icon: MdAttachMoney,
      tone: "blue",
    },
  ];

  const quickActions = [
    {
      label: "Scan to Borrow",
      desc: "Scan equipment QR code",
      icon: MdQrCodeScanner,
      path: "/scanner",
      primary: true,
    },
    {
      label: "My Requests",
      desc: "Track borrow requests",
      icon: MdAssignment,
      path: "/my-requests",
    },
    {
      label: "My Activity",
      desc: "Borrowing history",
      icon: MdHistory,
      path: "/usage-logs",
    },
    {
      label: "Lab Manuals",
      desc: "Guides & references",
      icon: MdMenuBook,
      path: "/manuals",
    },
  ];

  const unreadCount = notifs.filter((n) => !n.read).length;
  const displayedUnread = notifs.slice(0, 5).filter((n) => !n.read).length;
  const remainingUnread = unreadCount - displayedUnread;

  if (borrowedLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      {/* Greeting */}
      <div className="dash-greeting">
        <h1>{getGreeting()}, <span style={{ color: "#a5d6a7" }}>{firstName}</span></h1>
        <p>Here's what's happening with your equipment today.</p>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        {stats.map(({ key, label, value, icon: Icon, tone }) => (
          <div className="dash-stat" key={key}>
            <span className={`dash-stat-icon ${tone}`}>
              <Icon size={22} />
            </span>
            <div className="dash-stat-body">
              <span className="dash-stat-value">{value}</span>
              <span className="dash-stat-label">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="dash-actions">
        {quickActions.map(({ label, desc, icon: Icon, path, primary }) => (
          <button
            key={path}
            className={`dash-action${primary ? " primary" : ""}`}
            onClick={() => navigate(path)}
          >
            <span className="dash-action-icon">
              <Icon size={22} />
            </span>
            <span className="dash-action-text">
              <span className="dash-action-label">{label}</span>
              <span className="dash-action-desc">{desc}</span>
            </span>
            <MdArrowForward size={16} className="dash-action-arrow" />
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="dash-panels">
        {/* My Current Borrows */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>
              <MdHistory size={18} /> My Current Borrows
            </h3>
            <button
              className="dash-panel-link"
              onClick={() => navigate("/usage-logs")}
            >
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {overdueItems.length > 0 && (
            <div className="dash-overdue-alert">
              <MdWarning size={16} />
              <span>
                You have <strong>{overdueItems.length}</strong> overdue item
                {overdueItems.length > 1 ? "s" : ""} — return them to avoid
                fines.
              </span>
            </div>
          )}

          {borrowed.length === 0 ? (
            <div className="dash-empty">
              <MdInventory size={32} />
              <p>You haven't borrowed anything yet</p>
              <button onClick={() => navigate("/scanner")}>
                Scan to borrow
              </button>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {borrowed.slice(0, 6).map((item, i) => {
                    const due = toDate(item.dueDate);
                    const isOverdue = due && due < new Date();
                    return (
                      <tr key={item.id || i}>
                        <td style={{ fontWeight: 600 }}>
                          {item.itemName || "—"}
                        </td>
                        <td>{item.quantity || 1}</td>
                        <td>{formatShortDate(item.dueDate)}</td>
                        <td>
                          <span
                            className={`dash-badge ${isOverdue ? "overdue" : "borrowed"}`}
                          >
                            {isOverdue ? "Overdue" : "Borrowed"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>
              <MdNotificationsActive size={18} /> Notifications
            </h3>
            <button
              className="dash-panel-link"
              onClick={() => navigate("/notifications")}
            >
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {notifs.length === 0 ? (
            <div className="dash-empty">
              <MdNotifications size={32} />
              <p>No notifications right now</p>
            </div>
          ) : (
            <ul className="dash-notif-list">
              {notifs.slice(0, 5).map((n) => {
                const Icon = NOTIF_ICONS[n.type] || MdInfoOutline;
                const color = NOTIF_COLORS[n.type] || NOTIF_COLORS.info;
                return (
                  <li
                    key={n.id}
                    className={`dash-notif-item${n.read ? "" : " unread"}`}
                    onClick={() => navigate("/notifications")}
                  >
                    <span className="dash-notif-icon" style={{ color }}>
                      <Icon size={17} />
                    </span>
                    <div className="dash-notif-body">
                      <span className="dash-notif-title">
                        {n.title || "Announcement"}
                      </span>
                      <span className="dash-notif-msg">{n.message}</span>
                    </div>
                  </li>
                );
              })}
              {remainingUnread > 0 && (
                <li
                  className="dash-notif-more"
                  onClick={() => navigate("/notifications")}
                >
                  +{remainingUnread} more unread
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                   ADMIN DASHBOARD              */
/* ═══════════════════════════════════════════════ */
function AdminDashboard() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const firstName =
    userProfile?.firstName ||
    user?.displayName?.split(" ")[0] ||
    "there";

  const { data: rawData, isLoading: reportLoading } = useReportSummary();
  const { data: notifData } = useMyNotifications();
  const { data: borrowRequestsData } = useBorrowRequests({ status: "pending" });

  const summary = useMemo(
    () =>
      rawData || {
        counts: {},
        charts: {},
        stats: {},
        borrowed: [],
        returned: [],
      },
    [rawData]
  );

  const notifs = useMemo(() => {
    if (!notifData) return [];
    const raw = notifData?.data;
    return Array.isArray(raw) ? raw : Array.isArray(notifData) ? notifData : [];
  }, [notifData]);
  const pendingRequests = useMemo(
    () => (borrowRequestsData || []).slice(0, 5),
    [borrowRequestsData]
  );

  const stats = [
    {
      key: "users",
      label: "Total Users",
      value: summary.counts?.users || 0,
      icon: MdPeople,
      tone: "blue",
      detail: `${summary.counts?.students || 0} students`,
    },
    {
      key: "catalog",
      label: "Catalog Items",
      value: summary.counts?.catalog || 0,
      icon: MdInventory2,
      tone: "green",
    },
    {
      key: "borrowed",
      label: "Active Borrows",
      value: summary.counts?.borrowed || 0,
      icon: MdHistory,
      tone: "orange",
      detail: `${summary.counts?.returned || 0} returned`,
    },
    {
      key: "pending",
      label: "Pending Requests",
      value: summary.stats?.pendingRequests || 0,
      icon: MdAssignment,
      tone: "amber",
    },
    {
      key: "fines",
      label: "Pending Fines",
      value: `₱${(summary.stats?.totalPendingFineAmount || 0).toLocaleString()}`,
      icon: MdAttachMoney,
      tone: "red",
      detail: `${summary.stats?.pendingFines || 0} unpaid`,
    },
    {
      key: "sessions",
      label: "Today's Sessions",
      value: summary.stats?.todaySessions || 0,
      icon: MdEventAvailable,
      tone: "teal",
    },
    {
      key: "incidents",
      label: "Open Incidents",
      value: summary.stats?.openIncidents || 0,
      icon: MdWarning,
      tone: "red",
    },
    {
      key: "maintenance",
      label: "Scheduled Maintenance",
      value: summary.stats?.scheduledMaintenance || 0,
      icon: MdBuild,
      tone: "purple",
    },
  ];

  const overdueItems = useMemo(() => {
    const now = new Date();
    return (summary.borrowed || [])
      .filter((b) => {
        const due = toDate(b.dueDate);
        return due && due < now;
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5);
  }, [summary.borrowed]);

  const recentTransactions = useMemo(
    () => (summary.borrowed || []).slice(0, 5),
    [summary.borrowed]
  );

  const quickActions = [
    {
      label: "Catalog",
      desc: "Manage inventory",
      icon: MdInventory,
      path: "/catalog",
    },
    {
      label: "Transactions",
      desc: "View all records",
      icon: MdSwapHoriz,
      path: "/transactions",
    },
    {
      label: "Borrow Requests",
      desc: "Review requests",
      icon: MdAssignment,
      path: "/borrow-requests",
    },
    {
      label: "Attendance",
      desc: "View logs",
      icon: MdEventAvailable,
      path: "/attendance",
    },
  ];

  const unreadCount = notifs.filter((n) => !n.read).length;
  const displayedUnread = notifs.slice(0, 5).filter((n) => !n.read).length;
  const remainingUnread = unreadCount - displayedUnread;

  if (reportLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      {/* Greeting */}
      <div className="dash-greeting">
        <h1>{getGreeting()}, <span style={{ color: "#a5d6a7" }}>{firstName}</span></h1>
        <p>Here's your laboratory overview for today.</p>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        {stats.map(({ key, label, value, icon: Icon, tone, detail }) => (
          <div className="dash-stat" key={key}>
            <span className={`dash-stat-icon ${tone}`}>
              <Icon size={22} />
            </span>
            <div className="dash-stat-body">
              <span className="dash-stat-value">{value}</span>
              <span className="dash-stat-label">{label}</span>
              {detail && (
                <span className="dash-stat-detail">{detail}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="dash-actions">
        {quickActions.map(({ label, desc, icon: Icon, path }) => (
          <button
            key={path}
            className="dash-action"
            onClick={() => navigate(path)}
          >
            <span className="dash-action-icon">
              <Icon size={22} />
            </span>
            <span className="dash-action-text">
              <span className="dash-action-label">{label}</span>
              <span className="dash-action-desc">{desc}</span>
            </span>
            <MdArrowForward size={16} className="dash-action-arrow" />
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="dash-panels">
        {/* Recent Transactions */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>
              <MdSwapHoriz size={18} /> Recent Transactions
            </h3>
            <button
              className="dash-panel-link"
              onClick={() => navigate("/transactions")}
            >
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {overdueItems.length > 0 && (
            <div className="dash-overdue-alert">
              <MdWarning size={16} />
              <span>
                <strong>{overdueItems.length}</strong> overdue item
                {overdueItems.length > 1 ? "s" : ""} require attention
              </span>
            </div>
          )}

          {recentTransactions.length === 0 ? (
            <div className="dash-empty">
              <MdSwapHoriz size={32} />
              <p>No transactions yet</p>
              <button onClick={() => navigate("/transactions")}>
                Open transactions
              </button>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Item</th>
                    <th>Action</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t, i) => {
                    const due = toDate(t.dueDate);
                    const isOverdue = due && due < new Date();
                    return (
                      <tr key={t.id || i}>
                        <td style={{ fontWeight: 600 }}>
                          {t.firstName
                            ? `${t.firstName} ${t.lastName || ""}`
                            : t.userName || "—"}
                        </td>
                        <td>{t.itemName || "—"}</td>
                        <td>
                          <span
                            className={`dash-badge ${isOverdue ? "overdue" : "borrowed"}`}
                          >
                            {t.action || "borrowed"}
                          </span>
                        </td>
                        <td>{formatShortDate(t.dueDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>
              <MdNotificationsActive size={18} /> Notifications
            </h3>
            <button
              className="dash-panel-link"
              onClick={() => navigate("/notifications")}
            >
              View all <MdArrowForward size={13} />
            </button>
          </div>

          {notifs.length === 0 ? (
            <div className="dash-empty">
              <MdNotifications size={32} />
              <p>No notifications right now</p>
            </div>
          ) : (
            <ul className="dash-notif-list">
              {notifs.slice(0, 5).map((n) => {
                const Icon = NOTIF_ICONS[n.type] || MdInfoOutline;
                const color = NOTIF_COLORS[n.type] || NOTIF_COLORS.info;
                return (
                  <li
                    key={n.id}
                    className={`dash-notif-item${n.read ? "" : " unread"}`}
                    onClick={() => navigate("/notifications")}
                  >
                    <span className="dash-notif-icon" style={{ color }}>
                      <Icon size={17} />
                    </span>
                    <div className="dash-notif-body">
                      <span className="dash-notif-title">
                        {n.title || "Announcement"}
                      </span>
                      <span className="dash-notif-msg">{n.message}</span>
                    </div>
                  </li>
                );
              })}
              {remainingUnread > 0 && (
                <li
                  className="dash-notif-more"
                  onClick={() => navigate("/notifications")}
                >
                  +{remainingUnread} more unread
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Pending Requests Row */}
      {pendingRequests.length > 0 && (
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>
              <MdAssignment size={18} /> Pending Borrowing Requests
            </h3>
            <button
              className="dash-panel-link"
              onClick={() => navigate("/borrow-requests")}
            >
              View all <MdArrowForward size={13} />
            </button>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Item</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r, i) => (
                  <tr key={r.id || i}>
                    <td style={{ fontWeight: 600 }}>
                      {r.userName || r.studentName || "—"}
                    </td>
                    <td>{r.itemName || "—"}</td>
                    <td>{formatShortDate(r.createdAt)}</td>
                    <td>
                      <span className="dash-badge pending">Pending</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                 MAIN DASHBOARD PAGE            */
/* ═══════════════════════════════════════════════ */
export default function DashboardPage() {
  const { role, loading } = useAuth();

  if (loading) return <LoadingState />;

  return role === "admin" ? <AdminDashboard /> : <StudentDashboard />;
}
