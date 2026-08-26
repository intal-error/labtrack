import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { filterBySearch } from "../../utils/search";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import {
  MdHistory, MdCheckCircle, MdAccessTime, MdWarning, MdSearch,
  MdEventBusy, MdInventory, MdQrCodeScanner, MdSchedule
} from "react-icons/md";

function toDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function timeAgo(date) {
  if (!date) return "";
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueLabel(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  const diff = dueDate - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true, urgency: "critical" };
  if (days === 0) return { text: "Due today", overdue: false, urgency: "urgent" };
  if (days === 1) return { text: "Due tomorrow", overdue: false, urgency: "urgent" };
  if (days <= 3) return { text: `Due in ${days}d`, overdue: false, urgency: "warning" };
  if (days <= 7) return { text: `Due in ${days}d`, overdue: false, urgency: "soon" };
  return { text: `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, overdue: false, urgency: "normal" };
}

function getDueProgress(borrowedAt, dueDate) {
  if (!borrowedAt || !dueDate) return null;
  const now = new Date();
  const total = dueDate - borrowedAt;
  const elapsed = now - borrowedAt;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export default function UsageLogsTab() {
  const { user } = useAuth();
  const [borrowed, setBorrowed] = useState([]);
  const [returned, setReturned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("borrowed");
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [b, r] = await Promise.all([api.getMyBorrowed(), api.getMyReturned()]);
      setBorrowed(b || []);
      setReturned(r || []);
    } catch {
      toast.error("Failed to load activity");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const now = new Date();
    const overdueCount = borrowed.filter((t) => {
      const due = toDate(t.dueDate);
      return due && due < now;
    }).length;
    return {
      active: borrowed.length,
      overdue: overdueCount,
      returned: returned.length,
    };
  }, [borrowed, returned]);

  const filtered = useMemo(() => {
    const list = tab === "borrowed" ? borrowed : returned;
    if (!search) return list;
    return filterBySearch(list, search, ["itemName", "course"]);
  }, [tab, borrowed, returned, search]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="activity-page-header">
        <div className="activity-page-header-left">
          <h2><MdHistory size={24} /> My Activity</h2>
          <p className="activity-page-subtitle">Track your borrowed and returned equipment</p>
        </div>
        <Link to="/scanner" className="activity-scan-btn">
          <MdQrCodeScanner size={18} />
          Scan to Return
        </Link>
      </div>

      <div className="activity-stats">
        <div className={`activity-stat-card ${tab === "borrowed" ? "active" : ""}`} onClick={() => setTab("borrowed")}>
          <div className="activity-stat-icon active-borrow"><MdAccessTime size={20} /></div>
          <div className="activity-stat-info">
            <span className="activity-stat-number">{stats.active}</span>
            <span className="activity-stat-label">Borrowed</span>
          </div>
        </div>
        <div className={`activity-stat-card ${stats.overdue > 0 ? "stat-overdue" : ""}`}>
          <div className="activity-stat-icon overdue"><MdEventBusy size={20} /></div>
          <div className="activity-stat-info">
            <span className="activity-stat-number">{stats.overdue}</span>
            <span className="activity-stat-label">Overdue</span>
          </div>
        </div>
        <div className={`activity-stat-card ${tab === "returned" ? "active" : ""}`} onClick={() => setTab("returned")}>
          <div className="activity-stat-icon returned"><MdCheckCircle size={20} /></div>
          <div className="activity-stat-info">
            <span className="activity-stat-number">{stats.returned}</span>
            <span className="activity-stat-label">Returned</span>
          </div>
        </div>
      </div>

      <div className="activity-toolbar">
        <div className="activity-tab-bar">
          <button className={`activity-tab-btn ${tab === "borrowed" ? "active" : ""}`} onClick={() => setTab("borrowed")}>
            <MdAccessTime size={16} /> Borrowed ({borrowed.length})
          </button>
          <button className={`activity-tab-btn ${tab === "returned" ? "active" : ""}`} onClick={() => setTab("returned")}>
            <MdCheckCircle size={16} /> Returned ({returned.length})
          </button>
        </div>
        <div className="activity-search">
          <MdSearch size={16} />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="usage-log-list">
        {filtered.length === 0 ? (
          <div className="activity-empty">
            <MdInventory size={56} />
            <h3>{search ? "No matching items" : tab === "borrowed" ? "No active borrows" : "No return history"}</h3>
            <p>{search ? "Try adjusting your search" : tab === "borrowed" ? "Items you borrow will appear here" : "Returned items will appear here"}</p>
            {tab === "borrowed" && !search && (
              <a href="/scanner" className="activity-empty-link">
                <MdQrCodeScanner size={14} /> Go to Scanner
              </a>
            )}
          </div>
        ) : filtered.map((item) => {
          const date = toDate(item.timestamp || item.borrowedAt);
          const dueDateVal = toDate(item.dueDate);
          const returnDate = toDate(item.returnedAt);
          const isOverdue = dueDateVal && dueDateVal < new Date() && tab === "borrowed";
          const dueInfo = dueLabel(dueDateVal);
          const progress = tab === "borrowed" ? getDueProgress(date, dueDateVal) : null;

          return (
            <div className={`usage-log-card ${isOverdue ? "card-overdue" : ""} ${dueInfo?.urgency === "urgent" ? "card-urgent" : ""}`} key={item.id}>
              <div className="usage-log-icon">
                {tab === "returned"
                  ? <MdCheckCircle size={24} style={{ color: "#2e7d32" }} />
                  : isOverdue
                    ? <MdWarning size={24} style={{ color: "#d32f2f" }} />
                    : <MdAccessTime size={24} style={{ color: "#f57c00" }} />}
              </div>
              <div className="usage-log-body">
                <div className="usage-log-title-row">
                  <h4>{item.itemName}</h4>
                  <span className={`usage-log-status-badge ${tab === "returned" ? "returned" : isOverdue ? "overdue" : "borrowed"}`}>
                    {tab === "returned" ? "Returned" : isOverdue ? "Overdue" : item.status || "Borrowed"}
                  </span>
                </div>
                <div className="usage-log-meta">
                  <span className="usage-log-meta-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Qty: {item.quantity}
                  </span>
                  {item.course && (
                    <span className="usage-log-meta-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                      {item.course}
                    </span>
                  )}
                  {date && (
                    <span className="usage-log-meta-item">
                      <MdSchedule size={12} />
                      {timeAgo(date)}
                    </span>
                  )}
                </div>
                {tab === "borrowed" && dueInfo && (
                  <div className={`usage-log-due ${isOverdue ? "overdue" : ""}`}>
                    <div className="usage-log-due-text">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                      {dueInfo.text}
                    </div>
                    {progress !== null && (
                      <div className="usage-log-progress">
                        <div className={`usage-log-progress-bar ${isOverdue ? "overdue" : dueInfo.urgency === "urgent" ? "urgent" : dueInfo.urgency === "warning" ? "warning" : ""}`}>
                          <div className="usage-log-progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        <span className="usage-log-progress-label">{Math.round(progress)}% of time elapsed</span>
                      </div>
                    )}
                  </div>
                )}
                {tab === "returned" && returnDate && (
                  <div className="usage-log-return-info">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
                    Returned {timeAgo(returnDate)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
