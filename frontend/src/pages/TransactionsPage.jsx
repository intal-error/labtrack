import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { toDate, formatDate, getRemainingQuantity } from "../utils/helpers";
import { filterBySearch } from "../utils/search";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Modal from "../components/ui/Modal";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";
import { MdSwapHoriz } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import ViewToggle from "../components/ui/ViewToggle";

const AVATAR_COLORS = ["#2E7D32", "#1565c0", "#6a1b9a", "#c62828", "#ef6c00", "#00838f", "#4e342e", "#37474f"];

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

function getOverdueInfo(date, quantity, returnedQuantity) {
  if (!date) return null;
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days >= 14) return { text: `${days}d overdue`, className: "overdue-critical" };
  if (days >= 7) return { text: `${days}d overdue`, className: "overdue-warning" };
  return null;
}

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest First" },
  { value: "date-asc", label: "Oldest First" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "qty-desc", label: "Qty High-Low" },
  { value: "qty-asc", label: "Qty Low-High" },
];

const DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

function matchesDateRange(date, range) {
  if (!date || range === "all") return true;
  const now = new Date();
  const d = new Date(date);
  if (range === "today") {
    return d.toDateString() === now.toDateString();
  }
  if (range === "week") {
    return (now - d) < 7 * 24 * 60 * 60 * 1000;
  }
  if (range === "month") {
    return (now - d) < 30 * 24 * 60 * 60 * 1000;
  }
  return true;
}

function sortItems(items, sortBy) {
  const [key, dir] = sortBy.split("-");
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === "date") {
      const da = toDate(a.timestamp)?.getTime() || 0;
      const db = toDate(b.timestamp)?.getTime() || 0;
      return (da - db) * mult;
    }
    if (key === "name") {
      const na = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
      const nb = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
      return na.localeCompare(nb) * mult;
    }
    if (key === "qty") {
      return ((a.quantity || 0) - (b.quantity || 0)) * mult;
    }
    return 0;
  });
}

export default function TransactionsPage() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState("borrowed");
  const [borrowed, setBorrowed] = useState([]);
  const [returned, setReturned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("All");
  const [sortBy, setSortBy] = useState("date-desc");
  const [dateRange, setDateRange] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const [returningId, setReturningId] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const isStudent = role === "student";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const borrowedFn = isStudent ? api.getMyBorrowed : api.getBorrowed;
      const returnedFn = isStudent ? api.getMyReturned : api.getReturned;
      const [borrowedData, returnedData] = await Promise.all([
        borrowedFn(),
        returnedFn(),
      ]);
      setBorrowed(borrowedData || []);
      setReturned(returnedData || []);
    } catch (err) {
      toast.error(err.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [isStudent]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const dueSoon = borrowed.filter((b) => {
      if (!b.dueDate) return false;
      const due = toDate(b.dueDate);
      if (!due) return false;
      const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 3;
    }).length;
    return {
      totalBorrowed: borrowed.length,
      totalReturned: returned.length,
      active: borrowed.filter((b) => getRemainingQuantity(b) > 0).length,
      thisWeek: borrowed.filter((b) => {
        const d = toDate(b.timestamp);
        if (!d) return false;
        return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
      }).length,
      dueSoon,
    };
  }, [borrowed, returned]);

  const filterItems = useCallback((items) => {
    let result = items;
    if (filterCourse !== "All") {
      result = result.filter((item) => item.course === filterCourse || item.equipment_course === filterCourse);
    }
    if (dateRange !== "all") {
      result = result.filter((item) => matchesDateRange(toDate(item.timestamp), dateRange));
    }
    if (search) result = filterBySearch(result, search, ["schoolID", "firstName", "lastName", "itemName", "course", "year", "equipment_course", "assigned_admin_id"]);
    return sortItems(result, sortBy);
  }, [filterCourse, dateRange, search, sortBy]);

  const activeItems = useMemo(() =>
    activeTab === "borrowed" ? filterItems(borrowed) : filterItems(returned),
  [activeTab, borrowed, returned, filterItems]);

  const allCount = useMemo(() => {
    const all = activeTab === "borrowed" ? borrowed : returned;
    let result = all;
    if (filterCourse !== "All") result = result.filter((i) => i.course === filterCourse || i.equipment_course === filterCourse);
    if (dateRange !== "all") result = result.filter((i) => matchesDateRange(toDate(i.timestamp), dateRange));
    if (search) result = filterBySearch(result, search, ["schoolID", "firstName", "lastName", "itemName", "course", "year", "equipment_course"]);
    return result.length;
  }, [activeTab, borrowed, returned, filterCourse, dateRange, search]);

  const downloadReport = async () => {
    try {
      await api.downloadReport(activeTab);
      toast.success("Report downloaded!");
    } catch (err) {
      toast.error(err.message || "Download failed");
    }
  };

  async function handleQuickReturn(item) {
    const remaining = getRemainingQuantity(item);
    if (remaining <= 0) return;
    if (!confirm(`Return ${remaining} of "${item.itemName}" from ${item.firstName}?`)) return;
    setReturningId(item.id);
    try {
      await api.recordReturn({ transactionId: item.id, quantity: remaining });
      toast.success("Item returned successfully");
      load();
    } catch (err) {
      toast.error(err.message || "Return failed");
    } finally {
      setReturningId(null);
    }
  }

  function handleViewInfo(item) {
    setSelectedTransaction(item);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <section className="transactions-page">
      <PageHero icon={MdSwapHoriz} title="Transactions" subtitle={isStudent ? "Track your borrowed and returned equipment" : "Track all borrowed and returned equipment"}>
        <button className="hero-action-btn ghost" onClick={load}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
        {!isStudent && (
          <button className="hero-action-btn primary" onClick={downloadReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Report
          </button>
        )}
      </PageHero>

      <div className="transactions-stats">
        <div className="stat-card stat-active">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.active}</span>
            <span className="stat-label">{isStudent ? "My Active Borrows" : "Active Borrows"}</span>
          </div>
        </div>
        <div className="stat-card stat-borrowed-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.totalBorrowed}</span>
            <span className="stat-label">{isStudent ? "My Total Borrowed" : "Total Borrowed"}</span>
          </div>
        </div>
        <div className="stat-card stat-returned-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.totalReturned}</span>
            <span className="stat-label">{isStudent ? "My Total Returned" : "Total Returned"}</span>
          </div>
        </div>
        <div className="stat-card stat-week">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{isStudent ? stats.dueSoon : stats.thisWeek}</span>
            <span className="stat-label">{isStudent ? "Due Soon" : "This Week"}</span>
          </div>
        </div>
      </div>

      <div className="transactions-toolbar">
        <div className="transactions-toolbar-left">
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
          <div className="transactions-result-count">
            Showing {activeItems.length} of {allCount}
          </div>
        </div>
        <div className="transactions-toolbar-right">
          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-transactions-view" />
          <select className="transactions-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="transactions-date-filter" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {!isStudent && (
            <select className="transactions-course-filter" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
              <option value="All">All Courses</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div className="transactions-search">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name, ID, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
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
          <p>{search || filterCourse !== "All" || dateRange !== "all" ? "Try adjusting your filters" : `No ${activeTab} transactions yet`}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="transactions-grid">
          {activeItems.map((item) => {
            const date = toDate(item.timestamp);
            const isBorrowed = activeTab === "borrowed";
            const remaining = isBorrowed ? getRemainingQuantity(item) : null;
            const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
            const color = getAvatarColor(fullName);
            const overdue = isBorrowed ? getOverdueInfo(date, item.quantity, item.returnedQuantity) : null;
            const isReturning = returningId === item.id;
            const returnDate = !isBorrowed ? toDate(item.returnedAt || item.timestamp) : null;

            return (
              <div className={`transaction-card ${overdue?.className || ""}`} key={item.id} onClick={() => handleViewInfo(item)} style={{cursor:"pointer"}}>
                <div className={`transaction-card-accent ${isBorrowed ? "accent-borrowed" : "accent-returned"}`} />
                <div className="transaction-card-body">
                  <div className="transaction-card-top">
                    <div className="transaction-avatar" style={item.profileURL ? { background: "transparent" } : { background: color }}>
                      {item.profileURL ? (
                        <img src={item.profileURL} alt={fullName} />
                      ) : (
                        getInitials(item.firstName, item.lastName)
                      )}
                    </div>
                    <div className="transaction-card-info">
                      <h4 className="transaction-name">{fullName || "-"}</h4>
                      <p className="transaction-school-id">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                        {item.schoolID || "-"}
                      </p>
                    </div>
                    <div className="transaction-card-badges">
                      {overdue && <span className={`overdue-badge ${overdue.className}`}>{overdue.text}</span>}
                      <span className={`transaction-status-badge ${isBorrowed ? "status-borrowed" : "status-returned"}`}>
                        {isBorrowed ? "Borrowed" : (item.status || "Returned")}
                      </span>
                    </div>
                  </div>
                  <div className="transaction-card-details">
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      <span>{item.itemName || "-"}</span>
                    </div>
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                      <span>Qty: {isBorrowed ? `${remaining} / ${item.quantity || 0}` : (item.quantity || 0)}</span>
                    </div>
                    <div className="transaction-detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                      <span>{date ? timeAgo(date) : "-"}</span>
                    </div>
                    {isBorrowed && item.dueDate && (
                      <div className="transaction-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <span style={{ color: overdue ? "var(--red)" : undefined }}>Due: {formatDate(toDate(item.dueDate))}</span>
                      </div>
                    )}
                    {!isBorrowed && returnDate && (
                      <div className="transaction-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <span>Returned: {formatDate(returnDate)}</span>
                      </div>
                    )}
                  </div>
                  {item.course && <span className="transaction-course-tag">{item.course}{item.year ? ` - ${item.year}` : ""}</span>}
                  {item.equipment_course && item.equipment_course !== item.course && (
                    <span className="transaction-course-tag" style={{ marginLeft: 4, background: "#f57c0020", color: "#f57c00" }}>
                      Equipment: {item.equipment_course}
                    </span>
                  )}
                  {isBorrowed && item.quantity > 0 && remaining >= 0 && (
                    <div className="transaction-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${item.quantity > 0 ? Math.max(0, ((item.quantity - remaining) / item.quantity) * 100) : 0}%` }} />
                      </div>
                      <span className="progress-label">{Math.max(0, item.quantity - remaining)} of {item.quantity} returned</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="transactions-table-wrapper">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>School ID</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Equipment Course</th>
                <th>{activeTab === "returned" ? "Borrowed" : "Date"}</th>
                {activeTab === "borrowed" && <th>Due Date</th>}
                {activeTab === "returned" && <th>Returned</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeItems.map((item) => {
                const date = toDate(item.timestamp);
                const isBorrowed = activeTab === "borrowed";
                const remaining = isBorrowed ? getRemainingQuantity(item) : null;
                const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
                const overdue = isBorrowed ? getOverdueInfo(date, item.quantity, item.returnedQuantity) : null;
                const isReturning = returningId === item.id;
                const returnDate = !isBorrowed ? toDate(item.returnedAt || item.timestamp) : null;

                return (
                  <tr key={item.id} className={overdue?.className || ""} onClick={() => handleViewInfo(item)} style={{cursor:"pointer"}}>
                    <td className="table-name-cell">
                      <div className="table-user">
                        <div className="transaction-avatar-sm" style={item.profileURL ? { background: "transparent" } : { background: getAvatarColor(fullName) }}>
                          {item.profileURL ? (
                            <img src={item.profileURL} alt={fullName} />
                          ) : (
                            getInitials(item.firstName, item.lastName)
                          )}
                        </div>
                        <span>{fullName || "-"}</span>
                      </div>
                    </td>
                    <td>{item.schoolID || "-"}</td>
                    <td>{item.itemName || "-"}</td>
                    <td>{isBorrowed ? `${remaining} / ${item.quantity || 0}` : (item.quantity || 0)}</td>
                    <td>
                      {item.equipment_course ? (
                        <span style={item.equipment_course !== item.course ? { color: "#f57c00", fontWeight: 600 } : {}}>
                          {item.equipment_course}
                        </span>
                      ) : "-"}
                    </td>
                    <td>{date ? timeAgo(date) : "-"}</td>
                    {isBorrowed && (
                      <td style={{ color: overdue ? "var(--red)" : undefined, fontWeight: overdue ? 600 : undefined }}>
                        {item.dueDate ? formatDate(toDate(item.dueDate)) : "-"}
                      </td>
                    )}
                    {!isBorrowed && (
                      <td>{returnDate ? formatDate(returnDate) : "-"}</td>
                    )}
                    <td>
                      <div className="table-status-cell">
                        {overdue && <span className={`overdue-badge-sm ${overdue.className}`}>{overdue.text}</span>}
                        <span className={`transaction-status-badge-sm ${isBorrowed ? "status-borrowed" : "status-returned"}`}>
                          {isBorrowed ? "Borrowed" : (item.status || "Returned")}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTransaction && (
        <Modal title="Borrower Details" onClose={() => setSelectedTransaction(null)}>
          {(() => {
            const item = selectedTransaction;
            const isBorrowed = item.action === "borrowed" || item.status === "borrowed";
            const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
            const color = getAvatarColor(fullName);
            const borrowDate = isBorrowed
              ? toDate(item.timestamp || item.borrowedAt)
              : toDate(item.borrowedAt);
            const dueDate = toDate(item.dueDate);
            const returnDate = toDate(item.returnedAt || item.lastReturnedAt || (!isBorrowed ? item.timestamp : null));
            const remaining = isBorrowed ? getRemainingQuantity(item) : null;

            return (
              <div className="txn-detail-modal">
                <div className="txn-detail-borrower">
                  <div className="txn-detail-avatar" style={item.profileURL ? { background: "transparent" } : { background: color }}>
                    {item.profileURL ? (
                      <img src={item.profileURL} alt={fullName} />
                    ) : (
                      getInitials(item.firstName, item.lastName)
                    )}
                  </div>
                  <div className="txn-detail-borrower-info">
                    <h4>{fullName || "-"}</h4>
                    <p>{item.schoolID || "-"}</p>
                    {item.course && <span className="txn-detail-course">{item.course}{item.year ? ` - ${item.year}` : ""}</span>}
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
                    {item.equipment_course && (
                      <div className="txn-detail-row">
                        <span className="txn-detail-label">Equipment Course</span>
                        <span className="txn-detail-value">
                          {item.equipment_course}
                          {item.equipment_course !== item.course && (
                            <span style={{ color: "#f57c00", fontSize: 11, marginLeft: 6 }}>(Cross-course)</span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Quantity</span>
                      <span className="txn-detail-value">
                        {isBorrowed && remaining !== null
                          ? `${remaining} / ${item.quantity || 0}`
                          : (item.quantity || 0)}
                      </span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Status</span>
                      <span className={`txn-detail-value status-${isBorrowed ? "borrowed" : "returned"}`}>
                        {isBorrowed ? "Borrowed" : (item.status || "Returned")}
                      </span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Borrowed</span>
                      <span className="txn-detail-value">{borrowDate ? formatDate(borrowDate) : "-"}</span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Due Date</span>
                      <span className="txn-detail-value">{dueDate ? formatDate(dueDate) : "-"}</span>
                    </div>
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Returned</span>
                      <span className="txn-detail-value">{returnDate ? formatDate(returnDate) : "-"}</span>
                    </div>
                    {item.conditionOnBorrow && (
                      <div className="txn-detail-row">
                        <span className="txn-detail-label">Condition (Borrow)</span>
                        <span className="txn-detail-value">{item.conditionOnBorrow}</span>
                      </div>
                    )}
                    {item.conditionOnReturn && (
                      <div className="txn-detail-row">
                        <span className="txn-detail-label">Condition (Return)</span>
                        <span className="txn-detail-value">{item.conditionOnReturn}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(item.borrowPhotoURL || item.returnPhotoURL) && (
                  <div className="txn-detail-section">
                    <h5>Condition Photos</h5>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {item.borrowPhotoURL && (
                        <div style={{ textAlign: "center" }}>
                          <img src={item.borrowPhotoURL} alt="Borrow condition" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>At Borrow</div>
                        </div>
                      )}
                      {item.returnPhotoURL && (
                        <div style={{ textAlign: "center" }}>
                          <img src={item.returnPhotoURL} alt="Return condition" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>At Return</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      )}
    </section>
  );
}
