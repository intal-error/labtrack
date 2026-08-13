import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { api } from "../services/api";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import "../styles/pages/dashboard.css";

const COLORS = ["#2e7d32", "#ff6f00", "#fbc02d", "#1976d2"];

export default function DashboardPage() {
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, students: 0, faculty: 0, users: 0 });
  const [chartData, setChartData] = useState([]);
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
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <section className="dashboard-page">
      <h1>DIGITAL TRACKING SYSTEM</h1>
      <div className="cards">
        <div className="card orange">Borrowed Items<br /><span>{counts.borrowed}</span></div>
        <div className="card orange">Returned Items<br /><span>{counts.returned}</span></div>
        <div className="card green">Students<br /><span>{counts.students}</span></div>
        <div className="card green">Faculty<br /><span>{counts.faculty}</span></div>
        <div className="card orange">Users<br /><span>{counts.users}</span></div>
      </div>

      <div className="chart-box">
        <h2>Overall Report</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p>No data available</p>
        )}
      </div>
    </section>
  );
}
