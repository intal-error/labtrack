import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const COLORS = ["#2E7D32", "#ff6f00", "#fbc02d", "#1976d2", "#d32f2f", "#7b1fa2"];
const AVATAR_COLORS = ["#2E7D32", "#1565c0", "#6a1b9a", "#c62828", "#ef6c00", "#00838f", "#4e342e", "#37474f"];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const CardIcon = ({ type }) => {
  const icons = {
    borrowed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>,
    returned: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
    students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
    faculty: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    pending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    total: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>,
  };
  return icons[type] || null;
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function OverviewTab() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, students: 0, faculty: 0, users: 0 });
  const [chartData, setChartData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [countsData, chartDataRes, activityData] = await Promise.all([
          api.getDashboardCounts(),
          api.getChartData(),
          api.getRecentActivity(),
        ]);
        setCounts(countsData);
        setChartData([
          { name: "Borrowed", value: chartDataRes.borrowed },
          { name: "Returned", value: chartDataRes.returned },
          { name: "Available", value: chartDataRes.available },
          { name: "Inventory", value: chartDataRes.inventory },
        ]);
        setRecentActivity((activityData || []).slice(0, 10));
      } catch {
        toast.error("Failed to load overview");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <div className="tab-content">
      <div className="overview-greeting">
        <h2>{getGreeting()}</h2>
        <p>{formatDate()}</p>
      </div>

      <div className="overview-actions">
        <button className="overview-action-btn primary" onClick={() => navigate("/transactions")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
          Borrow Item
        </button>
        <button className="overview-action-btn" onClick={() => navigate("/catalog")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Add Item
        </button>
        <button className="overview-action-btn" onClick={() => navigate("/transactions")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          View All
        </button>
      </div>

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
        {isAdmin && (
          <>
            <div className="overview-card blue">
              <div className="overview-card-icon"><CardIcon type="students" /></div>
              <span>{counts.students}</span>
              <div className="overview-card-label">Students</div>
              <small>Registered</small>
            </div>
            <div className="overview-card purple">
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
            <div className="overview-card teal">
              <div className="overview-card-icon"><CardIcon type="total" /></div>
              <span>{counts.users}</span>
              <div className="overview-card-label">Total Users</div>
              <small>All accounts</small>
            </div>
          </>
        )}
      </div>

      <div className="overview-bottom-row">
        <div className="overview-charts">
          <div className="chart-box">
            <h3>Laboratory Inventory</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} barSize={50} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, Math.ceil(maxVal * 1.2)]} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#132b1d", border: "1px solid rgba(50,213,131,.2)", borderRadius: 10, color: "#e3f1de", fontSize: 13 }}
                    cursor={{ fill: "rgba(50,213,131,.06)" }}
                  />
                  <Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p>No data available</p>}
          </div>
        </div>

        <div className="overview-activity">
          <div className="chart-box">
            <h3><span className="overview-activity-header"><CardIcon type="activity" /> Recent Activity</span></h3>
            {recentActivity.length > 0 ? (
              <div className="activity-list">
                {recentActivity.map((item, i) => (
                  <div className="activity-item" key={item.id || i} onClick={() => setSelectedActivity(item)}>
                    <div className="activity-avatar" style={{ background: item.profileURL ? "transparent" : (item.action === "returned" ? "#22c55e" : COLORS[i % COLORS.length]) }}>
                      {item.profileURL ? (
                        <img src={item.profileURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }} />
                      ) : (
                        `${(item.firstName || "?")[0]}${(item.lastName || "?")[0]}`
                      )}
                    </div>
                    <div className="activity-info">
                      <span className="activity-name">{item.firstName} {item.lastName}</span>
                      <span className="activity-detail">
                        <span className={`activity-badge ${item.action}`}>{item.action}</span>
                        {item.itemName || "an item"}{item.quantity > 1 ? ` (x${item.quantity})` : ""}
                      </span>
                      {item.action === "borrowed" && item.dueDate && (
                        <span className="activity-due">Due {new Date(item.dueDate).toLocaleDateString()}</span>
                      )}
                    </div>
                    <span className="activity-time">{item.timestamp ? timeAgo(item.timestamp) : ""}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="activity-empty">
                <CardIcon type="activity" />
                <p>No transactions yet</p>
                <button className="activity-empty-link" onClick={() => navigate("/transactions")}>View Transactions</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedActivity && (
        <Modal title="Transaction Details" onClose={() => setSelectedActivity(null)}>
          {(() => {
            const item = selectedActivity;
            const isBorrowed = item.action === "borrowed";
            const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
            const color = item.action === "returned" ? "#22c55e" : getAvatarColor(fullName);
            const initials = `${(item.firstName || "?")[0]}${(item.lastName || "?")[0]}`.toUpperCase();
            const actionDate = item.timestamp ? new Date(item.timestamp) : null;
            const dueDate = item.dueDate ? new Date(item.dueDate) : null;
            const returnedDate = item.returnedAt ? new Date(item.returnedAt) : null;

            return (
              <div className="txn-detail-modal">
                <div className="txn-detail-borrower">
                  <div className="txn-detail-avatar" style={{ background: item.profileURL ? "transparent" : color }}>
                    {item.profileURL ? (
                      <img src={item.profileURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }} />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="txn-detail-borrower-info">
                    <h4>{fullName || "-"}</h4>
                    {item.schoolID && <p>{item.schoolID}</p>}
                    {item.course && <span className="txn-detail-course">{item.course}</span>}
                    {item.email && <span className="txn-detail-email">{item.email}</span>}
                    {item.role && <span className={`txn-detail-role ${item.role}`}>{item.role}</span>}
                  </div>
                </div>

                <div className="txn-detail-section">
                  <h5>Transaction Details</h5>
                  <div className="txn-detail-grid">
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Item</span>
                      <span className="txn-detail-value">{item.itemName || "-"}</span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Quantity</span>
                      <span className="txn-detail-value">{item.quantity || 0}</span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Status</span>
                      <span className={`txn-detail-value status-${item.action}`}>
                        {isBorrowed ? "Borrowed" : "Returned"}
                      </span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">{isBorrowed ? "Borrowed" : "Returned"}</span>
                      <span className="txn-detail-value">
                        {actionDate ? actionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </span>
                    </div>
                    {isBorrowed && dueDate && (
                      <div className="txn-detail-row">
                        <span className="txn-detail-label">Due Date</span>
                        <span className="txn-detail-value">{dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    )}
                    {!isBorrowed && returnedDate && (
                      <div className="txn-detail-row">
                        <span className="txn-detail-label">Returned On</span>
                        <span className="txn-detail-value">{returnedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
