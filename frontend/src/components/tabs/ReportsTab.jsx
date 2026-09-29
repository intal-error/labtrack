import { useMemo } from "react";
import { api } from "../../services/api";
import { useReportSummary } from "../../hooks/useQueries";
import { toDate, fmtDate as formatDate } from "../../utils/helpers";
import toast from "react-hot-toast";
import EmptyChart from "../ui/EmptyChart";
import LoadError from "../ui/LoadError";
import ChartTooltip from "../ui/ChartTooltip";
import "../../styles/pages/tabs.css";
import {
  MdDownload, MdWarningAmber
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
const REQUEST_STATUS_COLORS = { pending: "#f9a825", approved: "#2E7D32", rejected: "#d32f2f", cancelled: "#888" };

const EMPTY_SUMMARY = {
  counts: { users: 0, students: 0, catalog: 0, borrowed: 0, returned: 0 },
  charts: { categoryData: [], conditionData: [], topBorrowedData: [], incidentData: [], requestStatusData: [] },
  stats: { openIncidents: 0, scheduledMaintenance: 0, pendingRequests: 0, pendingFines: 0, totalPendingFineAmount: 0, todaySessions: 0 },
  tables: { recentBorrowed: [], recentReturned: [], overdue: [], overdueTotal: 0 },
};

export default function ReportsTab() {
  const { data: rawData, isLoading, isError, refetch } = useReportSummary();
  const summary = useMemo(() => ({ ...EMPTY_SUMMARY, ...rawData }), [rawData]);

  async function downloadReport(type) {
    try {
      await api.downloadReport(type);
      toast.success("Report downloaded");
    } catch {
      toast.error("Download failed");
    }
  }

  const conditionData = summary.charts.conditionData || [];
  const incidentData = summary.charts.incidentData || [];
  const requestStatusData = summary.charts.requestStatusData || [];

  const overdueItems = useMemo(() => {
    const now = new Date();
    return (summary.tables.overdue || [])
      .map((b) => ({ ...b, daysOverdue: Math.ceil((now.getTime() - toDate(b.dueDate).getTime()) / (1000 * 60 * 60 * 24)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);
  }, [summary.tables.overdue]);

  const recentBorrowed = summary.tables.recentBorrowed || [];
  const recentReturned = summary.tables.recentReturned || [];
  const overdueCount = summary.tables.overdueTotal || overdueItems.length;

  if (isLoading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  if (isError)
    return (
      <div className="tab-content">
        <LoadError message="Couldn't load report data." onRetry={refetch} />
      </div>
    );

  return (
    <div className="tab-content">
      <button className="hero-action-btn ghost" onClick={() => downloadReport("borrowed")}>
        <MdDownload size={16} /> Borrowed
      </button>
      <button className="hero-action-btn ghost" onClick={() => downloadReport("returned")}>
        <MdDownload size={16} /> Returned
      </button>
      <button className="hero-action-btn ghost" onClick={() => downloadReport("catalog")}>
        <MdDownload size={16} /> Catalog
      </button>

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="overview-alert">
          <MdWarningAmber size={18} />
          <span><strong>{overdueCount}</strong> overdue item{overdueCount > 1 ? "s" : ""} require attention</span>
        </div>
      )}

      {/* Charts */}
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
          <h4><MdWarningAmber size={16} style={{ color: "#d32f2f" }} /> Overdue Items {overdueCount > 5 ? `(top 5 of ${overdueCount})` : ""}</h4>
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
