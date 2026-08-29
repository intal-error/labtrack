import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import {
  MdAssessment, MdDownload, MdPeople, MdInventory, MdWarning, MdBuild, MdSchedule,
  MdAssignment, MdAttachMoney, MdEventAvailable, MdWarningAmber
} from "react-icons/md";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

const CONDITION_COLORS = {
  Excellent: "#2E7D32", Good: "#1976d2", Fair: "#f9a825",
  Damaged: "#ef6c00", "For Repair": "#7b1fa2", Missing: "#c62828", Unknown: "#888"
};
const INCIDENT_COLORS = { open: "#d32f2f", investigating: "#f57c00", resolved: "#43A047" };
const CATEGORY_COLORS = ["#1976d2", "#2E7D32", "#f57c00", "#7b1fa2", "#c62828", "#00838f"];
const REQUEST_STATUS_COLORS = { pending: "#f9a825", approved: "#2E7D32", rejected: "#d32f2f", cancelled: "#888" };

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  const d = toDate(date);
  if (!d) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function daysBetween(d1, d2) {
  const a = toDate(d1);
  const b = toDate(d2);
  if (!a || !b) return 0;
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", fontSize: 12, color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function EmptyChart({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "var(--text-muted)", fontSize: 13 }}>
      {text}
    </div>
  );
}

export default function ReportsTab() {
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, users: 0, students: 0 });
  const [catalog, setCatalog] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [returned, setReturned] = useState([]);
  const [borrowed, setBorrowed] = useState([]);
  const [borrowRequests, setBorrowRequests] = useState([]);
  const [fines, setFines] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const results = await Promise.allSettled([
        api.getDashboardCounts(),
        api.getCatalog(),
        api.getIncidents(),
        api.getMaintenance(),
        api.getReturned(),
        api.getBorrowed(),
        api.getBorrowRequests(),
        api.getFines(),
        api.getTodayAttendance(),
      ]);
      const get = (i) => results[i].status === "fulfilled" ? results[i].value : [];
      setCounts(get(0));
      setCatalog(Array.isArray(get(1)) ? get(1) : []);
      setIncidents(Array.isArray(get(2)) ? get(2) : []);
      setMaintenance(Array.isArray(get(3)) ? get(3) : []);
      setReturned(Array.isArray(get(4)) ? get(4) : []);
      setBorrowed(Array.isArray(get(5)) ? get(5) : []);
      setBorrowRequests(Array.isArray(get(6)) ? get(6) : []);
      setFines(Array.isArray(get(7)) ? get(7) : []);
      setTodayAttendance(Array.isArray(get(8)) ? get(8) : []);
    } catch {
      toast.error("Failed to load overview data");
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(type) {
    try {
      await api.downloadReport(type);
      toast.success("Report downloaded");
    } catch {
      toast.error("Download failed");
    }
  }

  const stats = useMemo(() => ({
    users: counts.users || 0,
    students: counts.students || 0,
    catalog: catalog.length,
    borrowed: counts.borrowed || 0,
    returned: counts.returned || 0,
    openIncidents: incidents.filter((i) => i.status === "open").length,
    scheduledMaintenance: maintenance.filter((m) => m.status === "scheduled").length,
    pendingRequests: borrowRequests.filter((r) => r.status === "pending").length,
    pendingFines: fines.filter((f) => f.status === "pending").length,
    totalPendingFineAmount: fines.filter((f) => f.status === "pending").reduce((sum, f) => sum + (Number(f.totalFine) || 0), 0),
    todaySessions: todayAttendance.length,
  }), [counts, catalog, incidents, maintenance, borrowRequests, fines, todayAttendance]);

  const categoryData = useMemo(() => {
    const c = catalog.reduce((acc, item) => {
      const cat = item.category || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [catalog]);

  const conditionData = useMemo(() => {
    const c = catalog.reduce((acc, item) => {
      const cond = item.condition || "Unknown";
      acc[cond] = (acc[cond] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [catalog]);

  const topBorrowedData = useMemo(() => {
    const allTx = [...returned, ...borrowed];
    const c = allTx.reduce((acc, t) => {
      const name = t.itemName || "Unknown";
      acc[name] = (acc[name] || 0) + (Number(t.quantity) || 1);
      return acc;
    }, {});
    return Object.entries(c)
      .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + "..." : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [returned, borrowed]);

  const incidentData = useMemo(() => {
    const c = incidents.reduce((acc, inc) => {
      const s = inc.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(c).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [incidents]);

  const requestStatusData = useMemo(() => {
    const c = borrowRequests.reduce((acc, r) => {
      const s = r.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(c).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [borrowRequests]);

  const overdueItems = useMemo(() => {
    const now = new Date();
    return borrowed
      .filter((b) => {
        const due = toDate(b.dueDate);
        return due && due.getTime() < now.getTime();
      })
      .map((b) => ({ ...b, daysOverdue: daysBetween(b.dueDate, now) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);
  }, [borrowed]);

  const recentBorrowed = useMemo(() => borrowed.slice(0, 5), [borrowed]);
  const recentReturned = useMemo(() => returned.slice(0, 5), [returned]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdAssessment size={22} /> Overview</h2>
        <div className="reports-downloads">
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("borrowed")}>
            <MdDownload size={14} /> Borrowed
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("returned")}>
            <MdDownload size={14} /> Returned
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("catalog")}>
            <MdDownload size={14} /> Catalog
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="overview-metrics">
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(25,118,210,.1)", color: "#1976d2" }}><MdPeople size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.users}</div>
            <div className="overview-metric-label">Total Users</div>
            <div className="overview-metric-detail">{stats.students} students</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(46,125,50,.1)", color: "#2E7D32" }}><MdInventory size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.catalog}</div>
            <div className="overview-metric-label">Catalog Items</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(2,119,189,.1)", color: "#0277bd" }}><MdSchedule size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.borrowed}</div>
            <div className="overview-metric-label">Active Borrows</div>
            <div className="overview-metric-detail">{stats.returned} returned</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(249,168,37,.1)", color: "#f9a825" }}><MdAssignment size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.pendingRequests}</div>
            <div className="overview-metric-label">Pending Requests</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(229,57,53,.1)", color: "#e53935" }}><MdAttachMoney size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">₱{stats.totalPendingFineAmount.toLocaleString()}</div>
            <div className="overview-metric-label">Pending Fines</div>
            <div className="overview-metric-detail">{stats.pendingFines} unpaid</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(0,137,123,.1)", color: "#00897b" }}><MdEventAvailable size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.todaySessions}</div>
            <div className="overview-metric-label">Today's Sessions</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(245,124,0,.1)", color: "#f57c00" }}><MdWarning size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.openIncidents}</div>
            <div className="overview-metric-label">Open Incidents</div>
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="overview-metric-icon" style={{ background: "rgba(123,31,162,.1)", color: "#7b1fa2" }}><MdBuild size={20} /></div>
          <div className="overview-metric-body">
            <div className="overview-metric-value">{stats.scheduledMaintenance}</div>
            <div className="overview-metric-label">Scheduled Maintenance</div>
          </div>
        </div>
      </div>

      {/* Overdue Alert */}
      {overdueItems.length > 0 && (
        <div className="overview-alert">
          <MdWarningAmber size={18} />
          <span><strong>{overdueItems.length}</strong> overdue item{overdueItems.length > 1 ? "s" : ""} require attention</span>
        </div>
      )}

      {/* Categories Chart */}
      <div className="report-chart-box">
        <h4>Categories</h4>
        {categoryData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {categoryData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        ) : <EmptyChart text="No catalog data" />}
      </div>

      {/* Charts Row 2 */}
      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Item Condition</h4>
          {conditionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={conditionData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={75} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Items" radius={[0, 6, 6, 0]}>
                  {conditionData.map((entry) => <Cell key={entry.name} fill={CONDITION_COLORS[entry.name] || "#888"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No condition data" />}
        </div>
        <div className="report-chart-box">
          <h4>Top Borrowed</h4>
          {topBorrowedData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topBorrowedData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={100} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Borrows" fill="#2E7D32" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No borrowing history" />}
        </div>
      </div>

      {/* Charts Row 3 */}
      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Request Status</h4>
          {requestStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={requestStatusData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {requestStatusData.map((entry) => <Cell key={entry.name} fill={REQUEST_STATUS_COLORS[entry.name.toLowerCase()] || "#888"} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No requests yet" />}
        </div>
        <div className="report-chart-box">
          <h4>Incident Status</h4>
          {incidentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={incidentData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {incidentData.map((entry) => <Cell key={entry.name} fill={INCIDENT_COLORS[entry.name.toLowerCase()] || "#888"} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No incidents" />}
        </div>
      </div>

      {/* Data Tables */}
      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Currently Borrowed</h4>
          {recentBorrowed.length > 0 ? (
            <div className="overview-table-wrap">
              <table className="overview-table">
                <thead>
                  <tr><th>Borrower</th><th>Item</th><th>Qty</th><th>Due</th></tr>
                </thead>
                <tbody>
                  {recentBorrowed.map((b) => (
                    <tr key={b.id}>
                      <td>{b.userName || b.studentName || "—"}</td>
                      <td>{b.itemName || "—"}</td>
                      <td>{b.quantity || 1}</td>
                      <td>{formatDate(b.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyChart text="No active borrows" />}
        </div>
        <div className="report-chart-box">
          <h4>Recently Returned</h4>
          {recentReturned.length > 0 ? (
            <div className="overview-table-wrap">
              <table className="overview-table">
                <thead>
                  <tr><th>Borrower</th><th>Item</th><th>Returned</th></tr>
                </thead>
                <tbody>
                  {recentReturned.map((r) => (
                    <tr key={r.id}>
                      <td>{r.userName || r.studentName || "—"}</td>
                      <td>{r.itemName || "—"}</td>
                      <td>{formatDate(r.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyChart text="No returns yet" />}
        </div>
      </div>

      {/* Overdue Table */}
      {overdueItems.length > 0 && (
        <div className="report-chart-box overview-overdue-box">
          <h4><MdWarningAmber size={16} style={{ color: "#d32f2f" }} /> Overdue Items</h4>
          <div className="overview-table-wrap">
            <table className="overview-table overview-overdue-table">
              <thead>
                <tr><th>Borrower</th><th>Item</th><th>Due Date</th><th>Days Overdue</th></tr>
              </thead>
              <tbody>
                {overdueItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.userName || item.studentName || "—"}</td>
                    <td>{item.itemName || "—"}</td>
                    <td>{formatDate(item.dueDate)}</td>
                    <td><span className="overview-overdue-badge">{item.daysOverdue}d overdue</span></td>
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
