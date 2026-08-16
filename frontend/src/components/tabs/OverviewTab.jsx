import { useState, useEffect } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
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
          <div className="overview-card-label">Pending Items</div>
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
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barSize={50} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 13, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 5]} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#132b1d", border: "1px solid rgba(76,175,80,.2)", borderRadius: 10, color: "#e3f1de", fontSize: 13 }}
                  cursor={{ fill: "rgba(76,175,80,.06)" }}
                />
                <Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p>No data available</p>}
        </div>
      </div>
    </div>
  );
}
