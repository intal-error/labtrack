import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const COLORS = ["#2e7d32", "#ff6f00", "#fbc02d", "#1976d2", "#d32f2f", "#7b1fa2"];

const CardIcon = ({ type }) => {
  const icons = {
    borrowed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>,
    returned: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
    students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
    faculty: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    pending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    total: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  };
  return icons[type] || null;
};

export default function OverviewTab() {
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, students: 0, faculty: 0, users: 0 });
  const [chartData, setChartData] = useState([]);
  const [gradeData, setGradeData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [countsData, chartDataRes] = await Promise.all([
          api.getDashboardCounts(),
          api.getChartData(),
        ]);
        setCounts(countsData);
        setChartData([
          { name: "Borrowed", value: chartDataRes.borrowed },
          { name: "Returned", value: chartDataRes.returned },
          { name: "Available", value: chartDataRes.available },
          { name: "Inventory", value: chartDataRes.inventory },
        ]);

        const records = await api.getRecords().catch(() => []);
        if (records.length) {
          const grades = { Passed: 0, Failed: 0, Pending: 0, "In Progress": 0 };
          records.forEach((r) => {
            const s = (r.status || "").toLowerCase();
            if (s === "passed") grades.Passed++;
            else if (s === "failed") grades.Failed++;
            else if (s === "pending") grades.Pending++;
            else grades["In Progress"]++;
          });
          setGradeData(Object.entries(grades).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0));
        }

        setTrendData([
          { month: "Jan", performance: 82, completion: 75 },
          { month: "Feb", performance: 85, completion: 80 },
          { month: "Mar", performance: 78, completion: 72 },
          { month: "Apr", performance: 90, completion: 88 },
          { month: "May", performance: 88, completion: 85 },
        ]);
      } catch {
        toast.error("Failed to load overview");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="overview-cards">
        <div className="overview-card orange">
          <div className="overview-card-icon"><CardIcon type="borrowed" /></div>
          <span>{counts.borrowed}</span>
          <div className="overview-card-label">Borrowed Items</div>
          <small>Currently out</small>
        </div>
        <div className="overview-card green">
          <div className="overview-card-icon"><CardIcon type="returned" /></div>
          <span>{counts.returned}</span>
          <div className="overview-card-label">Returned Items</div>
          <small>This period</small>
        </div>
        <div className="overview-card blue">
          <div className="overview-card-icon"><CardIcon type="students" /></div>
          <span>{counts.students}</span>
          <div className="overview-card-label">Students</div>
          <small>Registered</small>
        </div>
        <div className="overview-card green">
          <div className="overview-card-icon"><CardIcon type="faculty" /></div>
          <span>{counts.faculty}</span>
          <div className="overview-card-label">Faculty</div>
          <small>Active</small>
        </div>
        <div className="overview-card red">
          <div className="overview-card-icon"><CardIcon type="pending" /></div>
          <span>{chartData.find((d) => d.name === "Inventory")?.value || 0}</span>
          <div className="overview-card-label">Pending Records</div>
          <small>Need attention</small>
        </div>
        <div className="overview-card orange">
          <div className="overview-card-icon"><CardIcon type="total" /></div>
          <span>{counts.users}</span>
          <div className="overview-card-label">Total Users</div>
          <small>All accounts</small>
        </div>
      </div>

      <div className="overview-charts">
        <div className="chart-box">
          <h3>Laboratory Inventory</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p>No data available</p>}
        </div>

        <div className="chart-box">
          <h3>Grade Distribution</h3>
          {gradeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={gradeData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {gradeData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p>No records yet</p>}
        </div>

        <div className="chart-box chart-box-full">
          <h3>Performance Trends</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="performance" fill="#2e7d32" name="Performance" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completion" fill="#ff9800" name="Completion" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
