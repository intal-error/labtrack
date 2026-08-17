import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import {
  MdHistory, MdCheckCircle, MdAccessTime, MdWarning, MdSearch,
  MdAssignmentReturn, MdEventBusy, MdInventory
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
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  if (days <= 7) return { text: `Due in ${days}d`, overdue: false };
  return { text: `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, overdue: false };
}

export default function UsageLogsTab() {
  const { user } = useAuth();
  const [borrowed, setBorrowed] = useState([]);
  const [returned, setReturned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("borrowed");
  const [search, setSearch] = useState("");
  const [returning, setReturning] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [b, r] = await Promise.all([api.getBorrowed(), api.getReturned()]);
      const userId = user?.uid;
      setBorrowed(b.filter((t) => t.userId === userId));
      setReturned(r.filter((t) => t.userId === userId));
    } catch {
      toast.error("Failed to load activity");
    } finally {
      setLoading(false);
    }
  }

  async function handleReturn(item) {
    if (!confirm(`Return ${item.itemName} (qty: ${item.quantity})?`)) return;
    setReturning(item.id);
    try {
      await api.recordReturn({
        borrowId: item.id,
        itemId: item.catalogId,
        schoolID: item.schoolID,
        quantity: item.quantity,
      });
      toast.success(`${item.itemName} returned`);
      load();
    } catch {
      toast.error("Failed to record return");
    } finally {
      setReturning(null);
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
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        t.itemName?.toLowerCase().includes(q) ||
        t.course?.toLowerCase().includes(q)
    );
  }, [tab, borrowed, returned, search]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdHistory size={22} /> My Activity</h2>
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
            <MdInventory size={48} />
            <h3>{search ? "No matching items" : tab === "borrowed" ? "No active borrows" : "No return history"}</h3>
            <p>{search ? "Try adjusting your search" : tab === "borrowed" ? "Items you borrow will appear here" : "Returned items will appear here"}</p>
          </div>
        ) : filtered.map((item) => {
          const date = toDate(item.timestamp || item.borrowedAt);
          const dueDateVal = toDate(item.dueDate);
          const returnDate = toDate(item.returnedAt);
          const isOverdue = dueDateVal && dueDateVal < new Date() && tab === "borrowed";
          const dueInfo = dueLabel(dueDateVal);
          return (
            <div className={`usage-log-card ${isOverdue ? "card-overdue" : ""}`} key={item.id}>
              <div className="usage-log-icon">
                {tab === "returned"
                  ? <MdCheckCircle size={22} style={{ color: "#2e7d32" }} />
                  : isOverdue
                    ? <MdWarning size={22} style={{ color: "#d32f2f" }} />
                    : <MdAccessTime size={22} style={{ color: "#f57c00" }} />}
              </div>
              <div className="usage-log-body">
                <h4>{item.itemName}</h4>
                <div className="usage-log-meta">
                  <span>Qty: {item.quantity}</span>
                  {date && <span>Borrowed {timeAgo(date)}</span>}
                  {dueInfo && (
                    <span className={isOverdue ? "meta-overdue" : ""}>
                      {dueInfo.text}
                    </span>
                  )}
                  {returnDate && <span>Returned {timeAgo(returnDate)}</span>}
                  {item.course && <span>{item.course}</span>}
                </div>
              </div>
              <div className="usage-log-actions">
                <span className={`badge ${tab === "returned" ? "badge-success" : isOverdue ? "badge-danger" : "badge-warning"}`}>
                  {tab === "returned" ? "Returned" : isOverdue ? "Overdue" : item.status || "Borrowed"}
                </span>
                {tab === "borrowed" && (
                  <button
                    className="btn btn-sm btn-return"
                    onClick={() => handleReturn(item)}
                    disabled={returning === item.id}
                  >
                    <MdAssignmentReturn size={14} />
                    {returning === item.id ? "Returning..." : "Return"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
