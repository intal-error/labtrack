import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import {
  useMyBorrowed,
  useMyReturned,
  useMyBorrowRequests,
  useBorrowRequests,
  useReportSummary,
  useStudentAttendance,
  useMyFines,
  useMyNotifications,
  pickNotifications,
} from "../hooks/useQueries";
import { api } from "../services/api";
import { toDate, timeAgo, getOverdueInfo } from "../utils/helpers";
import DateRangeFilter from "../components/ui/DateRangeFilter";
import { DEFAULT_RANGE, rangeToParams } from "../components/ui/dateRange";
import EmptyChart from "../components/ui/EmptyChart";
import LoadError from "../components/ui/LoadError";
import ChartTooltip from "../components/ui/ChartTooltip";
import {
  MdQrCodeScanner,
  MdInventory,
  MdHistory,
  MdSwapHoriz,
  MdAssignment,
  MdWarning,
  MdArrowForward,
  MdEventBusy,
  MdInventory2,
  MdPeople,
  MdEventAvailable,
  MdBuild,
  MdAttachMoney,
  MdMenuBook,
  MdError,
  MdInfo,
  MdCheckCircle,
  MdNotificationsOff,
} from "react-icons/md";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "../styles/pages/dashboard.css";

function formatShortDate(date) {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRangeDate(value) {
  if (!value || typeof value !== "string") return "—";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return formatShortDate(value);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* Mirrors NotificationsTab.jsx so the dashboard strip and the full page agree. */
const NOTIF_TYPE = {
  alert: { Icon: MdError, tone: "red" },
  overdue: { Icon: MdError, tone: "red" },
  warning: { Icon: MdWarning, tone: "orange" },
  success: { Icon: MdCheckCircle, tone: "green" },
  info: { Icon: MdInfo, tone: "blue" },
};

function formatTableDate(value) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + ", "
    + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

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
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  const { data: borrowedData, isLoading: borrowedLoading } = useMyBorrowed();
  const { data: returnedData } = useMyReturned({ limit: 8 });
  const { data: myRequestsData } = useMyBorrowRequests();
  const { data: finesData } = useMyFines();
  const { data: attendanceData } = useStudentAttendance(userProfile?.schoolId);
  const { data: notifData } = useMyNotifications("limit=4");

  const borrowed = useMemo(() => borrowedData || [], [borrowedData]);
  const returned = useMemo(
    () => (Array.isArray(returnedData) ? returnedData : returnedData?.data || []),
    [returnedData]
  );
  const requests = useMemo(() => myRequestsData || [], [myRequestsData]);
  const fines = useMemo(() => finesData || [], [finesData]);
  const records = useMemo(() => attendanceData?.records || [], [attendanceData]);
  const notifications = useMemo(() => pickNotifications(notifData), [notifData]);

  const overdueItems = useMemo(() => {
    const now = new Date();
    return borrowed.filter((t) => {
      const d = toDate(t.dueDate);
      return d && d < now;
    });
  }, [borrowed]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );

  const unpaidFines = useMemo(
    () => fines.filter((f) => f.status === "pending"),
    [fines]
  );

  const totalSessions = attendanceData?.summary?.totalSessions || 0;

  const activeSession = useMemo(
    () => records.find((r) => r.status === "active"),
    [records]
  );

  const statusItems = [
    {
      key: "borrowed",
      label: "Items out",
      value: borrowed.length,
      detail: overdueItems.length > 0
        ? `${overdueItems.length} overdue`
        : borrowed.length > 0 ? "All on time" : "Nothing borrowed",
      tone: overdueItems.length > 0 ? "alert" : "ok",
      icon: MdSwapHoriz,
      path: "/my-activity?tab=borrowed",
    },
    {
      key: "fines",
      label: "Unpaid fines",
      value: unpaidFines.length,
      detail: unpaidFines.length > 0 ? "Settle at the lab counter" : "Nothing to pay",
      tone: unpaidFines.length > 0 ? "alert" : "ok",
      icon: MdAttachMoney,
      path: "/my-activity?tab=fines",
    },
    {
      key: "sessions",
      label: "Lab sessions",
      value: totalSessions,
      detail: activeSession
        ? `In ${activeSession.labRoom || "the lab"} now`
        : pendingRequests.length > 0
          ? `${pendingRequests.length} request${pendingRequests.length > 1 ? "s" : ""} awaiting approval`
          : "Attendance log",
      tone: activeSession || pendingRequests.length === 0 ? "ok" : "warn",
      icon: MdEventAvailable,
      path: "/my-activity?tab=attendance",
    },
  ];

  const recentTxns = useMemo(() => {
    const rows = [];
    borrowed.forEach((t) => {
      const at = toDate(t.timestamp) || toDate(t.borrowedAt);
      const dueAt = toDate(t.dueDate);
      rows.push({
        key: `borrow-${t.id}`,
        item: t.itemName || "Unnamed item",
        course: t.equipmentCourse || "—",
        at,
        kind: "borrowed",
        overdue: getOverdueInfo(dueAt),
        due: dueAt ? `Due ${formatShortDate(dueAt)}` : null,
      });
    });
    returned.forEach((t) => {
      const at = toDate(t.timestamp) || toDate(t.returnedAt);
      rows.push({
        key: `return-${t.id}`,
        item: t.itemName || "Unnamed item",
        course: t.equipmentCourse || "—",
        at,
        kind: "returned",
        overdue: null,
        due: null,
      });
    });
    return rows
      .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))
      .slice(0, 5);
  }, [borrowed, returned]);

  const recordRows = [
    {
      key: "attendance",
      label: "Attendance Record",
      desc: "View your lab attendance logs",
      icon: MdEventAvailable,
      tone: "blue",
      path: "/my-activity?tab=attendance",
      meta: `${totalSessions} session${totalSessions === 1 ? "" : "s"}`,
    },
    {
      key: "borrowing",
      label: "Borrowing History",
      desc: "View borrowed and returned items",
      icon: MdInventory,
      tone: "teal",
      path: "/my-activity?tab=borrowed",
      meta: `${borrowed.length} out`,
    },
    {
      key: "manuals",
      label: "Laboratory Manuals",
      desc: "View available lab manuals",
      icon: MdMenuBook,
      tone: "green",
      path: "/resources?tab=manuals",
      meta: null,
    },
    {
      key: "incident",
      label: "Report Incident",
      desc: "Damaged or missing item",
      icon: MdWarning,
      tone: "orange",
      path: "/resources?tab=incidents",
      meta: null,
    },
  ];

  function openNotification(n) {
    if (!n?.read) {
      api.markNotificationRead(n.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["myNotifications"] });
    }
    navigate(n?.link || "/notifications");
  }

  if (borrowedLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      <div className="dash-status-bar">
        {statusItems.map(({ key, label, value, detail, tone, icon: Icon, path }) => (
          <button
            key={key}
            type="button"
            className={`dash-status-chip ${tone}`}
            onClick={() => navigate(path)}
          >
            <span className="dash-status-icon"><Icon size={18} /></span>
            <span className="dash-status-body">
              <span className="dash-status-line">
                <strong>{value}</strong> {label}
              </span>
              <span className="dash-status-detail">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="sd-grid">
        {/* ── Scan QR ── */}
        <section className="sd-card sd-scan">
          <div className="sd-scan-frame">
            <MdQrCodeScanner size={64} />
          </div>
          <h3 className="sd-scan-title">Scan QR Code</h3>
          <p className="sd-scan-sub">Borrow &middot; Return &middot; Attendance</p>
          <div className="sd-scan-actions">
            <button
              className="btn btn-primary sd-scan-btn"
              onClick={() => navigate("/scanner")}
            >
              <MdQrCodeScanner size={18} /> Borrow &amp; Return
            </button>
            <button
              className="btn btn-outline sd-scan-btn"
              onClick={() => navigate("/scanner?tab=attendance")}
            >
              <MdEventAvailable size={18} /> Log Attendance
            </button>
          </div>
        </section>

        {/* ── My Records ── */}
        <section className="sd-card sd-records">
          <div className="sd-card-head">
            <h3>My Records</h3>
          </div>
          <ul className="sd-record-list">
            {recordRows.map(({ key, label, desc, icon: Icon, tone, path, meta }) => (
              <li key={key}>
                <button className="sd-record" onClick={() => navigate(path)}>
                  <span className={`sd-record-icon ${tone}`}>
                    <Icon size={20} />
                  </span>
                  <span className="sd-record-text">
                    <span className="sd-record-label">{label}</span>
                    <span className="sd-record-desc">{desc}</span>
                  </span>
                  {meta && <span className="sd-record-meta">{meta}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Recent Transactions ── */}
        <section className="sd-card sd-txn">
          <div className="sd-card-head">
            <h3>Recent Transactions</h3>
            <button className="dash-section-link" onClick={() => navigate("/my-activity")}>
              View all <MdArrowForward size={14} />
            </button>
          </div>
          {recentTxns.length === 0 ? (
            <div className="sd-empty">
              <MdHistory size={26} />
              <p>No transactions yet. Scan a QR code to borrow your first item.</p>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Course</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxns.map((t) => (
                    <tr key={t.key}>
                      <td className="sd-txn-item">{t.item}</td>
                      <td>{t.course}</td>
                      <td>{formatTableDate(t.at)}</td>
                      <td>
                        {t.overdue ? (
                          <span className="dash-badge overdue">{t.overdue.text}</span>
                        ) : t.kind === "returned" ? (
                          <span className="dash-badge returned">Returned</span>
                        ) : (
                          <span className="dash-badge borrowed">{t.due || "Borrowed"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Notifications ── */}
        <section className="sd-card sd-notif">
          <div className="sd-card-head">
            <h3>Notifications</h3>
            <button className="dash-section-link" onClick={() => navigate("/notifications")}>
              View all <MdArrowForward size={14} />
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="sd-empty">
              <MdNotificationsOff size={26} />
              <p>You&apos;re all caught up — no notifications.</p>
            </div>
          ) : (
            <ul className="sd-notif-list">
              {notifications.map((n, idx) => {
                const { Icon, tone } = NOTIF_TYPE[n.type] || NOTIF_TYPE.info;
                return (
                  <li key={n.id || `sd-notif-${idx}`}>
                    <button
                      className={`sd-notif-row ${n.read ? "" : "unread"}`}
                      onClick={() => openNotification(n)}
                    >
                      <span className={`sd-notif-icon ${tone}`}>
                        <Icon size={18} />
                      </span>
                      <span className="sd-notif-body">
                        <span className="sd-notif-title">{n.title || "Notification"}</span>
                        {n.message && (
                          <span className="sd-notif-msg">{n.message}</span>
                        )}
                      </span>
                      <span className="sd-notif-time">{timeAgo(n.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                   ADMIN DASHBOARD              */
/* ═══════════════════════════════════════════════ */
function AdminDashboard() {
  const navigate = useNavigate();

  const [range, setRange] = useState(DEFAULT_RANGE);
  // Preset ranges are relative to "today", so re-resolve once the calendar day rolls over.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setToday((prev) => {
        const now = new Date();
        return prev.toDateString() === now.toDateString() ? prev : now;
      });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const rangeParams = useMemo(() => rangeToParams(range, today), [range, today]);

  const {
    data: rawData,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchSummary,
  } = useReportSummary(rangeParams);
  const { data: borrowRequestsData } = useBorrowRequests({ status: "pending", limit: 5 });

  const summary = useMemo(
    () =>
      rawData || {
        counts: {},
        charts: {},
        stats: {},
        period: {},
      },
    [rawData]
  );

  const pendingRequests = useMemo(() => {
    const rows = Array.isArray(borrowRequestsData)
      ? borrowRequestsData
      : borrowRequestsData?.data || [];
    return rows.slice(0, 5);
  }, [borrowRequestsData]);

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

  const period = summary.period || {};
  const periodStats = [
    {
      key: "period-borrows",
      label: "Borrows",
      value: period.borrows || 0,
      icon: MdHistory,
      tone: "orange",
    },
    {
      key: "period-returns",
      label: "Returns",
      value: period.returns || 0,
      icon: MdSwapHoriz,
      tone: "green",
    },
    {
      key: "period-sessions",
      label: "Lab Sessions",
      value: period.sessions || 0,
      icon: MdEventAvailable,
      tone: "teal",
    },
    {
      key: "period-overdue",
      label: "Overdue Items",
      value: period.overdue || 0,
      icon: MdEventBusy,
      tone: "red",
    },
  ];

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

  const categoryData = summary.charts?.categoryData || [];
  const topBorrowedData = summary.charts?.topBorrowedData || [];
  const trendBorrowReturn = summary.charts?.trendBorrowReturn || [];
  const trendAttendance = summary.charts?.trendAttendance || [];
  const trendOverdue = summary.charts?.trendOverdue || [];

  // The backend always emits one bucket per day/week/month in the range, so the
  // empty state has to come from the values — not from whether the array is empty.
  const hasBorrowActivity = trendBorrowReturn.some((d) => d.borrowed > 0 || d.returned > 0);
  const hasSessions = trendAttendance.some((d) => d.sessions > 0);
  const hasOverdueTrend = trendOverdue.some((d) => d.overdue > 0);

  const renderStat = ({ key, label, value, icon: Icon, tone, detail }) => (
    <div className={`dash-stat ${key}`} key={key}>
      <span className={`dash-stat-icon ${tone}`}>
        <Icon size={22} />
      </span>
      <div className="dash-stat-body">
        <span className="dash-stat-value">{value}</span>
        <span className="dash-stat-label">{label}</span>
        {detail && <span className="dash-stat-detail">{detail}</span>}
      </div>
    </div>
  );

  if (reportLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      {/* Date Range Filter */}
      <div className="dash-filter-bar">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Keep stats/actions/charts on screen when a refetch fails — the banner
          explains the problem instead of blanking the page. */}
      {reportError && (
        <LoadError
          message="Couldn't load dashboard data."
          onRetry={refetchSummary}
        />
      )}

      <>
        {/* Period Stats */}
        <div className="dash-section-head">
          <h3>In selected period</h3>
          <span className="dash-section-sub">
            {formatRangeDate(period.from)} – {formatRangeDate(period.to)}
          </span>
        </div>
        <div className="dash-stats period">{periodStats.map(renderStat)}</div>

        {/* Current-state Stats */}
        <div className="dash-section-head">
          <h3>Right now</h3>
        </div>
        <div className="dash-stats">{stats.map(renderStat)}</div>

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

        {/* Charts */}
        <div className="dash-charts">
            <div className="dash-chart-card full">
              <h3 className="dash-chart-title">
                <MdSwapHoriz size={18} /> Borrow / Return Volume
              </h3>
              <div className="dash-chart-body">
                {hasBorrowActivity ? (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart
                        data={trendBorrowReturn}
                        margin={{ top: 5, right: 16, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="borrowed"
                          name="Borrows"
                          stroke="#2e7d32"
                          fill="#2e7d32"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="returned"
                          name="Returns"
                          stroke="#1976d2"
                          fill="#1976d2"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="dash-chart-legend">
                      <span className="dash-legend-item">
                        <span className="dash-legend-dot" style={{ background: "#2e7d32" }} />
                        Borrows
                      </span>
                      <span className="dash-legend-item">
                        <span className="dash-legend-dot" style={{ background: "#1976d2" }} />
                        Returns
                      </span>
                    </div>
                  </>
                ) : (
                  <EmptyChart text="No borrow or return activity in this period" />
                )}
              </div>
            </div>

            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdEventAvailable size={18} /> Lab Sessions per Day
              </h3>
              <div className="dash-chart-body">
                {hasSessions ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                      data={trendAttendance}
                      margin={{ top: 5, right: 16, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        name="Sessions"
                        stroke="#00897b"
                        fill="#00897b"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="No lab sessions in this period" />
                )}
              </div>
            </div>

            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdEventBusy size={18} /> Overdue Items
              </h3>
              <div className="dash-chart-body">
                {hasOverdueTrend ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={trendOverdue}
                      margin={{ top: 5, right: 16, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="overdue"
                        name="Overdue"
                        stroke="#e53935"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="No overdue data in this period" />
                )}
              </div>
            </div>

            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdInventory2 size={18} /> Items by Category
              </h3>
              <div className="dash-chart-body">
                {categoryData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={["#2e7d32", "#43a047", "#66bb6a", "#81c784", "#a5d6a7", "#1b5e20", "#388e3c", "#4caf50"][i % 8]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="dash-chart-legend">
                      {categoryData.map((item, i) => (
                        <span key={i} className="dash-legend-item">
                          <span
                            className="dash-legend-dot"
                            style={{ background: ["#2e7d32", "#43a047", "#66bb6a", "#81c784", "#a5d6a7", "#1b5e20", "#388e3c", "#4caf50"][i % 8] }}
                          />
                          {item.name} ({item.value})
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyChart text="No catalog data" />
                )}
              </div>
            </div>

            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdHistory size={18} /> Top Borrowed Items
              </h3>
              <div className="dash-chart-body">
                {topBorrowedData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={topBorrowedData}
                      layout="vertical"
                      margin={{ left: 10, right: 20, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="value" name="Units" radius={[0, 6, 6, 0]} barSize={18}>
                        {topBorrowedData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={["#2e7d32", "#43a047", "#66bb6a", "#81c784", "#a5d6a7"][i % 5]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="No borrowing activity in this period" />
                )}
              </div>
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
      </>
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
