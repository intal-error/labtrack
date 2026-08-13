import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const COLORS = ["#2e7d32", "#ff6f00", "#fbc02d", "#1976d2", "#d32f2f", "#7b1fa2"];

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
        <div className="overview-card orange">Borrowed Items<span>{counts.borrowed}</span><small>Currently out</small></div>
        <div className="overview-card green">Returned Items<span>{counts.returned}</span><small>This period</small></div>
        <div className="overview-card blue">Students<span>{counts.students}</span><small>Registered</small></div>
        <div className="overview-card green">Faculty<span>{counts.faculty}</span><small>Active</small></div>
        <div className="overview-card red">Pending Records<span>{chartData.find((d) => d.name === "Inventory")?.value || 0}</span><small>Need attention</small></div>
        <div className="overview-card orange">Total Users<span>{counts.users}</span><small>All accounts</small></div>
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
