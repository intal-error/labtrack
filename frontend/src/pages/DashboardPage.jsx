import { useMemo } from "react";
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
    () => fines.filter((f) => f.status === "unpaid"),
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

  const { data: rawData, isLoading: reportLoading } = useReportSummary();
  const { data: borrowRequestsData } = useBorrowRequests({ status: "pending" });

  const summary = useMemo(
    () =>
      rawData || {
        counts: {},
        charts: {},
        stats: {},
      },
    [rawData]
  );

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
  const hasCharts = categoryData.length > 0 || topBorrowedData.length > 0;

  if (reportLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      {/* Stats */}
      <div className="dash-stats">
        {stats.map(({ key, label, value, icon: Icon, tone, detail }) => (
          <div className={`dash-stat ${key}`} key={key}>
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

      {/* Charts */}
      {hasCharts && (
        <div className="dash-charts">
          {categoryData.length > 0 && (
            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdInventory2 size={18} /> Items by Category
              </h3>
              <div className="dash-chart-body">
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
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
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
              </div>
            </div>
          )}

          {topBorrowedData.length > 0 && (
            <div className="dash-chart-card">
              <h3 className="dash-chart-title">
                <MdHistory size={18} /> Top Borrowed Items
              </h3>
              <div className="dash-chart-body">
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
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                      {topBorrowedData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={["#2e7d32", "#43a047", "#66bb6a", "#81c784", "#a5d6a7"][i % 5]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

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
