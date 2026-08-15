import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { toDate, formatDate, getRemainingQuantity } from "../utils/helpers";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";

const AVATAR_COLORS = ["#2e7d32", "#1565c0", "#6a1b9a", "#c62828", "#ef6c00", "#00838f", "#4e342e", "#37474f"];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(first, last) {
  return `${(first || "")[0] || ""}${(last || "")[0] || ""}`.toUpperCase() || "?";
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
  return formatDate(date);
}

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState("borrowed");
  const [borrowed, setBorrowed] = useState([]);
  const [returned, setReturned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [borrowedData, returnedData] = await Promise.all([
        api.getBorrowed(),
        api.getReturned(),
      ]);
      setBorrowed(borrowedData || []);
      setReturned(returnedData || []);
    } catch (err) {
      toast.error(err.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = {
    totalBorrowed: borrowed.length,
    totalReturned: returned.length,
    active: borrowed.filter((b) => getRemainingQuantity(b) > 0).length,
    thisWeek: borrowed.filter((b) => {
      const d = toDate(b.timestamp);
      if (!d) return false;
      return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  const filterItems = (items) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) =>
      (item.schoolID || "").toLowerCase().includes(q) ||
      (item.firstName || "").toLowerCase().includes(q) ||
      (item.lastName || "").toLowerCase().includes(q) ||
      (item.itemName || "").toLowerCase().includes(q)
    );
  };

  const activeItems = activeTab === "borrowed" ? filterItems(borrowed) : filterItems(returned);

  const downloadReport = async () => {
    try {
      await api.downloadReport(activeTab);
      toast.success("Report downloaded!");
    } catch (err) {
      toast.error(err.message || "Download failed");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <section className="transactions-page">
      <div className="transactions-header">
        <div className="transactions-header-left">
          <h1>Transactions</h1>
          <p className="transactions-subtitle">Track all borrowed and returned equipment</p>
        </div>
        <button className="btn btn-green" onClick={downloadReport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Report
        </button>
      </div>

      <div className="transactions-stats">
        <div className="stat-card stat-active">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.active}</span>
            <span className="stat-label">Active Borrows</span>
          </div>
        </div>
        <div className="stat-card stat-borrowed-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.totalBorrowed}</span>
            <span className="stat-label">Total Borrowed</span>
          </div>
        </div>
        <div className="stat-card stat-returned-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.totalReturned}</span>
            <span className="stat-label">Total Returned</span>
          </div>
        </div>
        <div className="stat-card stat-week">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.thisWeek}</span>
            <span className="stat-label">This Week</span>
          </div>
        </div>
      </div>

      <div className="transactions-toolbar">
        <div className="transactions-tabs">
          <button className={`tab-btn ${activeTab === "borrowed" ? "active" : ""}`} onClick={() => setActiveTab("borrowed")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Borrowed
            <span className="tab-count">{borrowed.length}</span>
          </button>
          <button className={`tab-btn ${activeTab === "returned" ? "active" : ""}`} onClick={() => setActiveTab("returned")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
            Returned
            <span className="tab-count">{returned.length}</span>
          </button>
        </div>
        <div className="transactions-search">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="Search by name, ID, or item..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div className="transactions-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {activeTab === "borrowed" ? (
              <>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </>
            ) : (
              <>
                <polyline points="20,6 9,17 4,12"/>
                <circle cx="12" cy="12" r="10"/>
              </>
            )}
          </svg>
          <h3>No {activeTab} records found</h3>
          <p>{search ? "Try adjusting your search terms" : `No ${activeTab} transactions yet`}</p>
        </div>
      ) : (
        <div className="transactions-grid">
          {activeItems.map((item) => {
            const date = toDate(item.timestamp);
            const isBorrowed = activeTab === "borrowed";
            const remaining = isBorrowed ? getRemainingQuantity(item) : null;
            const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
            const color = getAvatarColor(fullName);

            return (
              <div className="transaction-card" key={item.id}>
                <div className={`transaction-card-accent ${isBorrowed ? "accent-borrowed" : "accent-returned"}`} />
                <div className="transaction-card-body">
                  <div className="transaction-card-top">
                    <div className="transaction-avatar" style={{ background: color }}>
                      {getInitials(item.firstName, item.lastName)}
                    </div>
                    <div className="transaction-card-info">
                      <h4 className="transaction-name">{fullName || "-"}</h4>
                      <p className="transaction-school-id">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                        {item.schoolID || "-"}
                      </p>
                    </div>
                    <span className={`transaction-status-badge ${isBorrowed ? "status-borrowed" : "status-returned"}`}>
                      {isBorrowed ? "Borrowed" : (item.status || "Returned")}
                    </span>
                  </div>
                  <div className="transaction-card-details">
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      <span>{item.itemName || "-"}</span>
                    </div>
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                      <span>
                        Qty: {isBorrowed ? `${remaining} / ${item.quantity || 0}` : (item.quantity || 0)}
                      </span>
                    </div>
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                      <span>{date ? formatDate(date) : "-"}</span>
                    </div>
                  </div>
                  {isBorrowed && item.quantity > 0 && (
                    <div className="transaction-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${((item.quantity - remaining) / item.quantity) * 100}%` }} />
                      </div>
                      <span className="progress-label">{item.quantity - remaining} of {item.quantity} returned</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
