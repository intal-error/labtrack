import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdAssessment, MdDownload, MdPeople, MdInventory, MdWarning, MdBuild, MdSchedule } from "react-icons/md";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const CONDITION_COLORS = {
  Excellent: "#2E7D32", Good: "#1976d2", Fair: "#f9a825",
  Damaged: "#ef6c00", "For Repair": "#7b1fa2", Missing: "#c62828", Unknown: "#888"
};
const INCIDENT_COLORS = { open: "#d32f2f", investigating: "#f57c00", resolved: "#43A047" };
const MAINTENANCE_COLORS = { scheduled: "#1976d2", "in-progress": "#f57c00", completed: "#43A047" };
const CATEGORY_COLORS = ["#1976d2", "#2E7D32", "#f57c00", "#7b1fa2", "#c62828", "#00838f"];

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getWeekLabel(date) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return `${months[start.getMonth()]} ${start.getDate()}`;
}

function EmptyChart({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-muted)", fontSize: 13 }}>
      {text}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
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

export default function ReportsTab() {
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, users: 0, students: 0, faculty: 0 });
  const [catalog, setCatalog] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [returned, setReturned] = useState([]);
  const [borrowed, setBorrowed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [c, cat, inc, maint, ret, bor] = await Promise.all([
        api.getDashboardCounts(),
        api.getCatalog(),
        api.getIncidents(),
        api.getMaintenance(),
        api.getReturned(),
        api.getBorrowed(),
      ]);
      setCounts(c);
      setCatalog(Array.isArray(cat) ? cat : []);
      setIncidents(Array.isArray(inc) ? inc : []);
      setMaintenance(Array.isArray(maint) ? maint : []);
      setReturned(Array.isArray(ret) ? ret : []);
      setBorrowed(Array.isArray(bor) ? bor : []);
    } catch {
      toast.error("Failed to load report data");
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
    faculty: counts.faculty || 0,
    catalog: catalog.length,
    borrowed: counts.borrowed || 0,
    incidents: incidents.length,
    openIncidents: incidents.filter((i) => i.status === "open").length,
    maintenance: maintenance.length,
    scheduledMaintenance: maintenance.filter((m) => m.status === "scheduled").length,
  }), [counts, catalog, incidents, maintenance]);

  const trendData = useMemo(() => {
    const allTransactions = [
      ...returned.map((t) => ({ ...t, _type: "returned", _date: t.borrowedAt || t.timestamp })),
      ...borrowed.map((t) => ({ ...t, _type: "borrowed", _date: t.timestamp })),
    ];
    const now = new Date();
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6, 23, 59, 59);
      const borrows = allTransactions.filter((t) => t._type === "borrowed" && toDate(t._date)?.getTime() >= weekStart.getTime() && toDate(t._date)?.getTime() <= weekEnd.getTime()).length;
      const returns = allTransactions.filter((t) => t._type === "returned" && toDate(t._date)?.getTime() >= weekStart.getTime() && toDate(t._date)?.getTime() <= weekEnd.getTime()).length;
      weeks.push({ name: getWeekLabel(weekStart), Borrows: borrows, Returns: returns });
    }
    return weeks;
  }, [returned, borrowed]);

  const categoryData = useMemo(() => {
    const counts = catalog.reduce((acc, item) => {
      const cat = item.category || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [catalog]);

  const conditionData = useMemo(() => {
    const counts = catalog.reduce((acc, item) => {
      const cond = item.condition || "Unknown";
      acc[cond] = (acc[cond] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [catalog]);

  const topBorrowedData = useMemo(() => {
    const allTx = [...returned, ...borrowed];
    const counts = allTx.reduce((acc, t) => {
      const name = t.itemName || "Unknown";
      acc[name] = (acc[name] || 0) + (Number(t.quantity) || 1);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + "..." : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [returned, borrowed]);

  const incidentData = useMemo(() => {
    const counts = incidents.reduce((acc, inc) => {
      const s = inc.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [incidents]);

  const maintenanceData = useMemo(() => {
    const counts = maintenance.reduce((acc, m) => {
      const s = m.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [maintenance]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdAssessment size={22} /> Reports Dashboard</h2>
        <div className="reports-downloads">
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("borrowed")}>
            <MdDownload size={14} /> Borrowed Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("returned")}>
            <MdDownload size={14} /> Returned Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("catalog")}>
            <MdDownload size={14} /> Catalog Excel
          </button>
        </div>
      </div>

      <div className="reports-summary-grid">
        <div className="report-summary-card">
          <MdPeople size={28} style={{ color: "#1976d2" }} />
          <div className="report-summary-value">{stats.users}</div>
          <div className="report-summary-label">Total Users</div>
          <div className="report-summary-detail">{stats.students} students, {stats.faculty} faculty</div>
        </div>
        <div className="report-summary-card">
          <MdInventory size={28} style={{ color: "#2E7D32" }} />
          <div className="report-summary-value">{stats.catalog}</div>
          <div className="report-summary-label">Catalog Items</div>
          <div className="report-summary-detail">{stats.borrowed} currently borrowed</div>
        </div>
        <div className="report-summary-card">
          <MdSchedule size={28} style={{ color: "#0277bd" }} />
          <div className="report-summary-value">{stats.borrowed}</div>
          <div className="report-summary-label">Active Borrows</div>
          <div className="report-summary-detail">{stats.returned} total returned</div>
        </div>
        <div className="report-summary-card">
          <MdWarning size={28} style={{ color: "#f57c00" }} />
          <div className="report-summary-value">{stats.incidents}</div>
          <div className="report-summary-label">Incidents</div>
          <div className="report-summary-detail">{stats.openIncidents} open</div>
        </div>
        <div className="report-summary-card">
          <MdBuild size={28} style={{ color: "#7b1fa2" }} />
          <div className="report-summary-value">{stats.maintenance}</div>
          <div className="report-summary-label">Maintenance</div>
          <div className="report-summary-detail">{stats.scheduledMaintenance} scheduled</div>
        </div>
      </div>

      <div className="reports-charts-grid">
        <div className="report-chart-box report-chart-wide">
          <h4>Borrowing Trend (Last 12 Weeks)</h4>
          {trendData.some((d) => d.Borrows > 0 || d.Returns > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradBorrows" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2E7D32" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2E7D32" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReturns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1976d2" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Borrows" stroke="#2E7D32" fill="url(#gradBorrows)" strokeWidth={2} />
                <Area type="monotone" dataKey="Returns" stroke="#1976d2" fill="url(#gradReturns)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No borrowing data yet" />}
        </div>

        <div className="report-chart-box">
          <h4>Category Distribution</h4>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {categoryData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No catalog data" />}
        </div>
      </div>

      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Item Condition Distribution</h4>
          {conditionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conditionData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={75} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Items" radius={[0, 6, 6, 0]}>
                  {conditionData.map((entry) => <Cell key={entry.name} fill={CONDITION_COLORS[entry.name] || "#888"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No condition data" />}
        </div>

        <div className="report-chart-box">
          <h4>Top Borrowed Items</h4>
          {topBorrowedData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topBorrowedData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Times Borrowed" fill="#2E7D32" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No borrowing history" />}
        </div>
      </div>

      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Incident Status</h4>
          {incidentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={incidentData} cx="50%" cy="50%" outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {incidentData.map((entry) => <Cell key={entry.name} fill={INCIDENT_COLORS[entry.name.toLowerCase()] || "#888"} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No incidents reported" />}
        </div>

        <div className="report-chart-box">
          <h4>Maintenance Status</h4>
          {maintenanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={maintenanceData} cx="50%" cy="50%" outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {maintenanceData.map((entry) => <Cell key={entry.name} fill={MAINTENANCE_COLORS[entry.name.toLowerCase()] || "#888"} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No maintenance records" />}
        </div>
      </div>
    </div>
  );
}
