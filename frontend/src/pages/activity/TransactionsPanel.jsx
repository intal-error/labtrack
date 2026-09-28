import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useMyBorrowed, useMyReturned } from "../../hooks/useQueries";
import { toDate, formatDate, getRemainingQuantity, computeTransactionStats, timeAgo } from "../../utils/helpers";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import LoadError from "../../components/ui/LoadError";
import ViewToggle from "../../components/ui/ViewToggle";
import "../../styles/pages/tables.css";

const PAGE_LIMIT = 25;

const AVATAR_COLORS = ["#2E7D32", "#1565c0", "#6a1b9a", "#c62828", "#ef6c00", "#00838f", "#4e342e", "#37474f"];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(first, last) {
  return `${(first || "")[0] || ""}${(last || "")[0] || ""}`.toUpperCase() || "?";
}

function getOverdueInfo(dueDate) {
  if (!dueDate) return null;
  const diff = Date.now() - dueDate.getTime();
  if (diff <= 0) return null;
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 1) return { text: "Overdue", className: "overdue-warning" };
  const wholeDays = Math.floor(days);
  return {
    text: `${wholeDays}d overdue`,
    className: days >= 7 ? "overdue-critical" : "overdue-warning",
  };
}

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest First" },
  { value: "date-asc", label: "Oldest First" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "qty-desc", label: "Qty High-Low" },
  { value: "qty-asc", label: "Qty Low-High" },
];

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
    if (key === "qty") return ((a.quantity || 0) - (b.quantity || 0)) * mult;
    return 0;
  });
}

export default function TransactionsPanel({ mode = "borrowed" }) {
  const [searchParams] = useSearchParams();
  // Keep local search in sync with the ?search= param driven by the header search bar.
  const urlSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(urlSearch);
  const [sortBy, setSortBy] = useState("date-desc");
  const [viewMode, setViewMode] = useState("list");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [page, setPage] = useState(1);

  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  const isBorrowed = mode === "borrowed";

  const [prevResetKeys, setPrevResetKeys] = useState([mode, search]);
  if (prevResetKeys[0] !== mode || prevResetKeys[1] !== search) {
    setPrevResetKeys([mode, search]);
    setPage(1);
  }

  const params = useMemo(() => {
    const p = {
      page: String(page),
      limit: String(PAGE_LIMIT),
      search: search || "",
    };
    return "?" + Object.entries(p)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }, [page, search]);

  const {
    data: borrowedData,
    isLoading: borrowedLoading,
    isError: borrowedFailed,
    error: borrowedError,
    refetch: refetchBorrowed,
  } = useMyBorrowed(params);
  const {
    data: returnedData,
    isLoading: returnedLoading,
    isError: returnedFailed,
    error: returnedError,
    refetch: refetchReturned,
  } = useMyReturned(params);

  const normalize = (src) => (!src ? [] : Array.isArray(src) ? src : src.data || []);

  const borrowed = useMemo(() => normalize(borrowedData), [borrowedData]);
  const returned = useMemo(() => normalize(returnedData), [returnedData]);

  const toPagination = (src) => (!src || Array.isArray(src) ? null : src.pagination || null);
  const borrowedPagination = useMemo(() => toPagination(borrowedData), [borrowedData]);
  const returnedPagination = useMemo(() => toPagination(returnedData), [returnedData]);
  const paginationData = isBorrowed ? borrowedPagination : returnedPagination;

  const loading = borrowedLoading || returnedLoading;
  const stats = useMemo(() => computeTransactionStats(borrowed, returned), [borrowed, returned]);

  const activeItems = isBorrowed ? borrowed : returned;
  const displayItems = useMemo(() => sortItems(activeItems, sortBy), [activeItems, sortBy]);
  const paginationTotal = paginationData?.total ?? activeItems.length;

  const load = () => {
    refetchBorrowed();
    refetchReturned();
  };

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  const activeError =
    isBorrowed
      ? (borrowedFailed ? borrowedError : null)
      : (returnedFailed ? returnedError : null);

  if (activeError && activeItems.length === 0) {
    return (
      <section className="transactions-page activity-panel">
        <LoadError
          message={activeError?.message || `Couldn't load your ${mode} transactions.`}
          onRetry={load}
        />
      </section>
    );
  }

  return (
    <section className="transactions-page activity-panel">
      <button className="hero-action-btn ghost" onClick={load}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Refresh
      </button>

      <div className="transactions-stats">
        <div className="stat-card stat-active">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{borrowedPagination?.total ?? stats.active}</span>
            <span className="stat-label">My Active Borrows</span>
          </div>
        </div>
        <div className="stat-card stat-borrowed-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{borrowedPagination?.total ?? stats.totalBorrowed}</span>
            <span className="stat-label">My Total Borrowed</span>
          </div>
        </div>
        <div className="stat-card stat-returned-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{returnedPagination?.total ?? stats.totalReturned}</span>
            <span className="stat-label">My Total Returned</span>
          </div>
        </div>
        <div className="stat-card stat-week">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.dueSoon}</span>
            <span className="stat-label">Due Soon</span>
          </div>
        </div>
      </div>

      <div className="transactions-toolbar">
        <div className="transactions-toolbar-left">
          <div className="transactions-result-count">
            Showing {displayItems.length} of {paginationTotal}
          </div>
        </div>
        <div className="transactions-toolbar-right">
          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-transactions-view" />
          <select className="transactions-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="transactions-search">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search item, course..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {displayItems.length === 0 ? (
        <div className="transactions-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {isBorrowed ? (
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
          <h3>No {mode} records found</h3>
          <p>{search ? "Try adjusting your search" : `No ${mode} transactions yet`}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="transactions-grid">
          {displayItems.map((item) => {
            const date = toDate(item.timestamp);
            const remaining = isBorrowed ? getRemainingQuantity(item) : null;
            const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
            const color = getAvatarColor(fullName);
            const overdue = isBorrowed ? getOverdueInfo(toDate(item.dueDate)) : null;
            const returnDate = !isBorrowed ? toDate(item.returnedAt || item.timestamp) : null;

            return (
              <div className={`transaction-card ${overdue?.className || ""}`} key={item.id} onClick={() => setSelectedTransaction(item)} style={{ cursor: "pointer" }}>
                <div className={`transaction-card-accent ${isBorrowed ? "accent-borrowed" : "accent-returned"}`} />
                <div className="transaction-card-body">
                  <div className="transaction-card-top">
                    <div className="transaction-avatar" style={item.profileURL ? { background: "transparent" } : { background: color }}>
                      {item.profileURL ? (
                        <img src={item.profileURL} alt={fullName} loading="lazy" width="40" height="40" decoding="async" />
                      ) : (
                        getInitials(item.firstName, item.lastName)
                      )}
                    </div>
                    <div className="transaction-card-info">
                      <h4 className="transaction-name">{fullName || "-"}</h4>
                      <p className="transaction-school-id">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                        {item.schoolId || "-"}
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
                        <div className="progress-fill" style={{ width: `${Math.max(0, ((item.quantity - remaining) / item.quantity) * 100)}%` }} />
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
                <th>{!isBorrowed ? "Borrowed" : "Date"}</th>
                {isBorrowed && <th>Due Date</th>}
                {!isBorrowed && <th>Returned</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item) => {
                const date = toDate(item.timestamp);
                const remaining = isBorrowed ? getRemainingQuantity(item) : null;
                const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
                const overdue = isBorrowed ? getOverdueInfo(toDate(item.dueDate)) : null;
                const returnDate = !isBorrowed ? toDate(item.returnedAt || item.timestamp) : null;

                return (
                  <tr key={item.id} className={overdue?.className || ""} onClick={() => setSelectedTransaction(item)} style={{ cursor: "pointer" }}>
                    <td className="table-name-cell">
                      <div className="table-user">
                        <div className="transaction-avatar-sm" style={item.profileURL ? { background: "transparent" } : { background: getAvatarColor(fullName) }}>
                          {item.profileURL ? (
                            <img src={item.profileURL} alt={fullName} loading="lazy" width="40" height="40" decoding="async" />
                          ) : (
                            getInitials(item.firstName, item.lastName)
                          )}
                        </div>
                        <span>{fullName || "-"}</span>
                      </div>
                    </td>
                    <td>{item.schoolId || "-"}</td>
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
                    {!isBorrowed && <td>{returnDate ? formatDate(returnDate) : "-"}</td>}
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

      {paginationData && paginationData.totalPages > 1 && (
        <Pagination
          currentPage={paginationData.page}
          totalPages={paginationData.totalPages}
          totalItems={paginationData.total}
          pageSize={paginationData.limit}
          onPageChange={setPage}
        />
      )}

      {selectedTransaction && (
        <Modal title="Transaction Details" onClose={() => setSelectedTransaction(null)}>
          <TransactionDetail item={selectedTransaction} />
        </Modal>
      )}
    </section>
  );
}

function TransactionDetail({ item }) {
  const modalIsBorrowed = item.action === "borrowed" || item.status === "borrowed";
  const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
  const color = getAvatarColor(fullName);
  const borrowDate = modalIsBorrowed ? toDate(item.timestamp || item.borrowedAt) : toDate(item.borrowedAt);
  const dueDate = toDate(item.dueDate);
  const returnDate = toDate(item.returnedAt || item.lastReturnedAt || (!modalIsBorrowed ? item.timestamp : null));
  const remaining = modalIsBorrowed ? getRemainingQuantity(item) : null;

  return (
    <div className="txn-detail-modal">
      <div className="txn-detail-borrower">
        <div className="txn-detail-avatar" style={item.profileURL ? { background: "transparent" } : { background: color }}>
          {item.profileURL ? (
            <img src={item.profileURL} alt={fullName} loading="lazy" width="40" height="40" decoding="async" />
          ) : (
            getInitials(item.firstName, item.lastName)
          )}
        </div>
        <div className="txn-detail-borrower-info">
          <h4>{fullName || "-"}</h4>
          <p>{item.schoolId || "-"}</p>
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
              {modalIsBorrowed && remaining !== null ? `${remaining} / ${item.quantity || 0}` : (item.quantity || 0)}
            </span>
          </div>
          <div className="txn-detail-row">
            <span className="txn-detail-label">Status</span>
            <span className={`txn-detail-value status-${modalIsBorrowed ? "borrowed" : "returned"}`}>
              {modalIsBorrowed ? "Borrowed" : (item.status || "Returned")}
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
                <img src={item.borrowPhotoURL} alt="Borrow condition" loading="lazy" width="200" height="200" decoding="async" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>At Borrow</div>
              </div>
            )}
            {item.returnPhotoURL && (
              <div style={{ textAlign: "center" }}>
                <img src={item.returnPhotoURL} alt="Return condition" loading="lazy" width="200" height="200" decoding="async" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>At Return</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
