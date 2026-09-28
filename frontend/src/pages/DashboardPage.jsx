import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useMyBorrowed,
  useMyBorrowRequests,
  useBorrowRequests,
  useReportSummary,
  useStudentAttendance,
  useMyFines,
} from "../hooks/useQueries";
import { toDate } from "../utils/helpers";
import DateRangeFilter from "../components/ui/DateRangeFilter";
import { DEFAULT_RANGE, rangeToParams } from "../components/ui/dateRange";
import EmptyChart from "../components/ui/EmptyChart";
import LoadError from "../components/ui/LoadError";
import ChartTooltip from "../components/ui/ChartTooltip";
import {
  MdQrCodeScanner,
  MdInventory,
  MdHistory,
  MdMenuBook,
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
  const { userProfile } = useAuth();

  const { data: borrowedData, isLoading: borrowedLoading } = useMyBorrowed();
  const { data: myRequestsData } = useMyBorrowRequests();
  const { data: finesData } = useMyFines();
  const { data: attendanceData } = useStudentAttendance(userProfile?.schoolId);

  const borrowed = useMemo(() => borrowedData || [], [borrowedData]);
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
    () => fines.filter((f) => f.status === "pending"),
    [fines]
  );

  const attendanceSummary = attendanceData?.summary || {};
  const totalSessions = attendanceSummary.totalSessions || 0;

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
    {
      key: "sessions",
      label: "Lab Sessions",
      value: totalSessions,
      icon: MdEventAvailable,
      tone: "teal",
    },
  ];

  const quickActions = [
    {
      label: "My Requests",
      desc: "Track borrow requests",
      icon: MdAssignment,
      path: "/my-activity?tab=requests",
    },
    {
      label: "My Activity",
      desc: "Borrowing history",
      icon: MdHistory,
      path: "/my-activity",
    },
    {
      label: "Lab Manuals",
      desc: "Guides & references",
      icon: MdMenuBook,
      path: "/manuals",
    },
  ];

  if (borrowedLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      {/* Hero Actions */}
      <div className="dash-hero-actions">
        <button
          className="dash-hero-action primary"
          onClick={() => navigate("/scanner")}
        >
          <span className="dash-hero-icon">
            <MdQrCodeScanner size={28} />
          </span>
          <div className="dash-hero-text">
            <span className="dash-hero-label">Scan to Borrow</span>
            <span className="dash-hero-desc">Scan equipment QR code</span>
          </div>
          <MdArrowForward size={18} className="dash-hero-arrow" />
        </button>
        <button
          className="dash-hero-action secondary"
          onClick={() => navigate("/scanner?tab=attendance")}
        >
          <span className="dash-hero-icon">
            <MdEventAvailable size={28} />
          </span>
          <div className="dash-hero-text">
            <span className="dash-hero-label">Log Attendance</span>
            <span className="dash-hero-desc">Sign in to lab room</span>
          </div>
          <MdArrowForward size={18} className="dash-hero-arrow" />
        </button>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        {stats.map(({ key, label, value, icon: Icon, tone }) => (
          <div className={`dash-stat ${key}`} key={key}>
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
