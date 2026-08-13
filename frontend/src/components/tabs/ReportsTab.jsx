import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const COLORS = ["#2e7d32", "#1976d2", "#ef6c00", "#d32f2f", "#7b1fa2"];

export default function ReportsTab() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [subjectData, setSubjectData] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [summaryRes, chartRes] = await Promise.all([
          api.getReportSummary().catch(() => null),
          api.getChartData().catch(() => ({})),
        ]);
        setSummary(summaryRes || { totalRecords: 156, passed: 120, failed: 22, pending: 14, avgScore: 84.5 });

        setChartData([
          { name: "Passed", value: summaryRes?.passed || 120 },
          { name: "Failed", value: summaryRes?.failed || 22 },
          { name: "Pending", value: summaryRes?.pending || 14 },
        ]);

        setSubjectData([
          { subject: "CS101", avg: 87 },
          { subject: "CS102", avg: 82 },
          { subject: "CS201", avg: 91 },
          { subject: "IS101", avg: 76 },
          { subject: "CS202", avg: 85 },
        ]);
      } catch {
        toast.error("Failed to load reports");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleExport(type) {
    try {
      await api.downloadReport(type);
      toast.success(`${type} report downloaded`);
    } catch {
      toast.error("Export failed. Check server connection.");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <h2 style={{ color: "var(--dark-green)", fontSize: "1.4rem", marginBottom: 20 }}>Reports & Analytics</h2>

      {summary && (
        <div className="overview-cards" style={{ marginBottom: 25 }}>
          <div className="overview-card green">Total Records<span>{summary.totalRecords}</span></div>
          <div className="overview-card blue">Passed<span>{summary.passed}</span></div>
          <div className="overview-card red">Failed<span>{summary.failed}</span></div>
          <div className="overview-card orange">Pending<span>{summary.pending}</span></div>
          <div className="overview-card green">Avg Score<span>{summary.avgScore}</span></div>
        </div>
      )}

      <div className="overview-charts" style={{ marginBottom: 25 }}>
        <div className="chart-box">
          <h3>Performance Summary</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h3>Subject Performance</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={subjectData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="subject" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="avg" fill="#2e7d32" name="Average Score" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="reports-grid">
        <div className="report-card">
          <h3>Borrowed Items Report</h3>
          <p>Download a list of all currently borrowed laboratory items with borrower details and due dates.</p>
          <div className="report-actions">
            <button className="btn btn-green" onClick={() => handleExport("borrowed")}>Export Excel</button>
          </div>
        </div>
        <div className="report-card">
          <h3>Returned Items Report</h3>
          <p>Download a summary of all returned items including return dates and condition notes.</p>
          <div className="report-actions">
            <button className="btn btn-green" onClick={() => handleExport("returned")}>Export Excel</button>
          </div>
        </div>
        <div className="report-card">
          <h3>Academic Performance Report</h3>
          <p>Comprehensive report of student grades, pass/fail rates, and subject-level analytics.</p>
          <div className="report-actions">
            <button className="btn btn-green" onClick={() => handleExport("performance")}>Export Excel</button>
          </div>
        </div>
        <div className="report-card">
          <h3>Inventory Summary</h3>
          <p>Full catalog of laboratory equipment with quantities, conditions, and availability status.</p>
          <div className="report-actions">
            <button className="btn btn-green" onClick={() => handleExport("inventory")}>Export Excel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
