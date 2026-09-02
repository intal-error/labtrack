import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdSearch, MdCheckCircle, MdCancel, MdWarning, MdSort, MdPerson, MdMoreVert, MdVisibility, MdAttachMoney, MdEventBusy, MdPeople, MdClose } from "react-icons/md";
import PesoIcon from "../ui/PesoIcon";
import PageHero from "../ui/PageHero";
import Pagination from "../ui/Pagination";

const STATUS_COLORS = { pending: "#f57c00", paid: "#43A047", waived: "#1976d2" };
const STATUS_LABELS = { pending: "Unpaid", paid: "Paid", waived: "Waived" };

function getInitials(name) {
  const parts = (name || "").split(" ").filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0]?.[0] || "?").toUpperCase();
}

function getAvatarColor(name) {
  const colors = ["#2E7D32", "#1565c0", "#6a1b9a", "#c62828", "#ef6c00", "#00838f", "#4e342e", "#37474f"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function fmtDate(date) {
  if (!date) return "-";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(date) {
  if (!date) return "-";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function FinesTab() {
  const { role, userProfile } = useAuth();
  const isAdmin = role === "admin";

  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("oldest");
  const [page, setPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);
  const [selectedFine, setSelectedFine] = useState(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [processing, setProcessing] = useState(null);
  const [openKebab, setOpenKebab] = useState(null);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => { if (role) load(); }, [role]);
  useEffect(() => { setPage(1); }, [search, filter]);
  useEffect(() => { if (role) load(); }, [page]);
  useEffect(() => {
    const handler = (e) => { if (!e.target.closest(".fines-kebab-wrap")) setOpenKebab(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      api.getOverdueCount().then((d) => setOverdueCount(d?.overdueBorrowers || 0)).catch(() => {});
    }
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: 25 };
      if (search.trim()) params.search = search.trim();
      if (filter !== "all" && filter !== "overdue") params.status = filter;
      const data = isAdmin ? await api.getFines(params) : await api.getMyFines(params);
      if (Array.isArray(data)) { setFines(data); setPaginationData(null); }
      else if (data?.data) { setFines(data.data); setPaginationData(data.pagination || null); }
      else { setFines([]); setPaginationData(null); }
    } catch (err) {
      setError(err.message || "Failed to load fines");
      toast.error("Failed to load fines");
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(id) {
    if (!confirm("Are you sure you want to mark this fine as Paid?")) return;
    setProcessing(id);
    try {
      await api.payFine(id);
      toast.success("Fine marked as paid");
      setSelectedFine(null);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update fine");
    } finally {
      setProcessing(null);
    }
  }

  async function handleWaive(id) {
    if (!waiveReason.trim()) return toast.error("Please provide a reason for waiving");
    setProcessing(id);
    try {
      await api.waiveFine(id, waiveReason.trim());
      toast.success("Fine waived");
      setSelectedFine(null);
      setWaiveReason("");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to waive fine");
    } finally {
      setProcessing(null);
    }
  }

  const stats = useMemo(() => {
    const total = fines.length;
    const pending = fines.filter((f) => f.status === "pending");
    const paid = fines.filter((f) => f.status === "paid");
    const waived = fines.filter((f) => f.status === "waived");
    const totalPendingAmount = pending.reduce((s, f) => s + (Number(f.totalFine) || 0), 0);
    const totalPaidAmount = paid.reduce((s, f) => s + (Number(f.totalFine) || 0), 0);
    const totalWaivedAmount = waived.reduce((s, f) => s + (Number(f.totalFine) || 0), 0);
    return { total, pending: pending.length, paid: paid.length, waived: waived.length, totalPendingAmount, totalPaidAmount, totalWaivedAmount };
  }, [fines]);

  const filtered = useMemo(() => {
    let result = fines;
    if (filter === "overdue") {
      result = result.filter((f) => f.status === "pending" && f.transactionStatus !== "returned");
    } else if (filter !== "all") {
      result = result.filter((f) => f.status === filter);
    }
    result = [...result].sort((a, b) => {
      if (sortBy === "newest") {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return db - da;
      }
      if (sortBy === "amount-asc") return (Number(a.totalFine) || 0) - (Number(b.totalFine) || 0);
      if (sortBy === "amount") return (Number(b.totalFine) || 0) - (Number(a.totalFine) || 0);
      if (sortBy === "name") return (a.itemName || "").localeCompare(b.itemName || "");
      if (sortBy === "dueDate") {
        const da = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate || 0);
        const db = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate || 0);
        return da - db;
      }
      return (Number(b.daysOverdue) || 0) - (Number(a.daysOverdue) || 0);
    });
    return result;
  }, [fines, filter, sortBy]);

  const outstandingFine = useMemo(() => {
    if (isAdmin) return null;
    return fines.find((f) => f.status === "pending") || null;
  }, [fines, isAdmin]);

  const pendingCount = useMemo(() => fines.filter((f) => f.status === "pending").length, [fines]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  if (error) return (
    <div className="tab-content">
      <PageHero icon={PesoIcon} title={isAdmin ? "Fines & Penalties" : "My Fines"} />
      <div className="maintenance-empty">
        <MdWarning size={48} />
        <h3>Failed to Load Fines</h3>
        <p>{error}</p>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={load}>Retry</button>
      </div>
    </div>
  );

  return (
    <div className="tab-content">
      <PageHero icon={PesoIcon} title={isAdmin ? "Fines & Penalties" : "My Fines"} subtitle={isAdmin ? "Manage and monitor all fine records" : "View your fine records and overdue information"} />

      {isAdmin ? (
        <AdminView
          stats={stats} overdueCount={overdueCount} filter={filter} setFilter={setFilter}
          search={search} setSearch={setSearch} sortBy={sortBy} setSortBy={setSortBy}
          filtered={filtered} paginationData={paginationData} page={page} setPage={setPage}
          setSelectedFine={setSelectedFine} openKebab={openKebab} setOpenKebab={setOpenKebab}
          handlePay={handlePay} processing={processing}
        />
      ) : (
        <StudentView
          stats={stats} outstandingFine={outstandingFine} pendingCount={pendingCount}
          filter={filter} setFilter={setFilter} search={search} setSearch={setSearch}
          sortBy={sortBy} setSortBy={setSortBy} filtered={filtered}
          paginationData={paginationData} page={page} setPage={setPage}
          setSelectedFine={setSelectedFine}
        />
      )}

      {selectedFine && (
        <DetailModal
          fine={selectedFine} isAdmin={isAdmin} onClose={() => { setSelectedFine(null); setWaiveReason(""); }}
          waiveReason={waiveReason} setWaiveReason={setWaiveReason}
          handlePay={handlePay} handleWaive={handleWaive} processing={processing}
        />
      )}
    </div>
  );
}

function AdminView({ stats, overdueCount, filter, setFilter, search, setSearch, sortBy, setSortBy, filtered, paginationData, page, setPage, setSelectedFine, openKebab, setOpenKebab, handlePay, processing }) {
  return (
    <>
      <div className="maintenance-stats" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {[
          { key: "all", label: "Total Fines", count: stats.total, icon: <PesoIcon size={20} />, cls: "" },
          { key: "pending", label: "Outstanding", count: `₱${stats.totalPendingAmount.toLocaleString()}`, icon: <MdAttachMoney size={20} />, cls: "outstanding" },
          { key: "paid", label: "Paid", count: stats.paid, icon: <MdCheckCircle size={20} />, cls: "completed" },
          { key: "waived", label: "Waived", count: stats.waived, icon: <MdCancel size={20} />, cls: "scheduled" },
          { key: "overdue", label: "Overdue Borrowers", count: overdueCount, icon: <MdPeople size={20} />, cls: "overdue" },
        ].map((s) => (
          <div className={`maintenance-stat-card ${filter === s.key ? "active" : ""}`} key={s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
            <div className={`maintenance-stat-icon ${s.cls} fines-stat-icon ${s.cls}`}>{s.icon}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">{s.count}</span>
              <span className="maintenance-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="maintenance-toolbar">
        <div className="maintenance-filter-tabs">
          {["all", "pending", "paid", "waived"].map((f) => (
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "pending" ? "Unpaid" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button className={`maintenance-filter-btn ${filter === "overdue" ? "active" : ""}`} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}>
            Currently Overdue
          </button>
          {(filter !== "all" || search) && (
            <button className="maintenance-filter-btn" onClick={() => { setFilter("all"); setSearch(""); }}>
              <MdClose size={12} /> Clear
            </button>
          )}
        </div>
        <div className="maintenance-toolbar-right">
          <div className="maintenance-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search borrower, ID, equipment..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="maintenance-sort">
            <MdSort size={14} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="oldest">Most Overdue</option>
              <option value="newest">Newest First</option>
              <option value="amount">Highest Fine</option>
              <option value="amount-asc">Lowest Fine</option>
              <option value="dueDate">Due Date</option>
              <option value="name">Item Name</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="maintenance-empty">
          <PesoIcon size={48} />
          <h3>{search || filter !== "all" ? "No Fines Found" : "No Fine Records"}</h3>
          <p>{search || filter !== "all" ? "There are currently no fine records matching your filters." : "There are currently no fine records in the system."}</p>
        </div>
      ) : (
        <div className="fines-table-wrapper">
          <table className="fines-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Equipment</th>
                <th>Days Overdue</th>
                <th>Fine Amount</th>
                <th>Status</th>
                <th>Date Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((fine) => (
                <tr key={fine.id} onClick={() => setSelectedFine(fine)}>
                  <td>
                    <div className="fines-borrower-cell">
                      <div className="fines-borrower-avatar" style={{ background: getAvatarColor(fine.userName) }}>{getInitials(fine.userName)}</div>
                      <div className="fines-borrower-info">
                        <span className="fines-borrower-name">{fine.userName || "Unknown"}</span>
                        <span className="fines-borrower-id">{fine.schoolId || fine.userId?.slice(0, 8) || "-"}</span>
                      </div>
                    </div>
                  </td>
                  <td>{fine.itemName || "-"}</td>
                  <td>{fine.daysOverdue || 0}d</td>
                  <td style={{ fontWeight: 600 }}>₱{Number(fine.totalFine || 0).toLocaleString()}</td>
                  <td><span className={`fines-status-badge fines-status-${fine.status}`}>{STATUS_LABELS[fine.status] || fine.status}</span></td>
                  <td>{fmtDate(fine.createdAt)}</td>
                  <td>
                    <div className="fines-actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="fines-view-btn" onClick={() => setSelectedFine(fine)}>
                        <MdVisibility size={12} /> View
                      </button>
                      {fine.status === "pending" && (
                        <div className="fines-kebab-wrap">
                          <button className="fines-kebab-btn" onClick={() => setOpenKebab(openKebab === fine.id ? null : fine.id)}>
                            <MdMoreVert size={16} />
                          </button>
                          {openKebab === fine.id && (
                            <div className="fines-kebab-dropdown">
                              <button disabled={processing === fine.id} onClick={() => { setOpenKebab(null); handlePay(fine.id); }}>
                                <MdCheckCircle size={14} /> Mark Paid
                              </button>
                              <button onClick={() => { setOpenKebab(null); setSelectedFine(fine); }}>
                                <MdCancel size={14} /> Waive
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginationData && (
        <Pagination currentPage={paginationData.page} totalPages={paginationData.totalPages} totalItems={paginationData.total} pageSize={paginationData.limit} onPageChange={setPage} />
      )}
    </>
  );
}

function StudentView({ stats, outstandingFine, pendingCount, filter, setFilter, search, setSearch, sortBy, setSortBy, filtered, paginationData, page, setPage, setSelectedFine }) {
  return (
    <>
      <div className="maintenance-stats">
        {[
          { key: "all", label: "All Fines", count: stats.total, icon: <PesoIcon size={20} />, cls: "" },
          { key: "pending", label: "Unpaid", count: stats.pending, icon: <MdWarning size={20} />, cls: "outstanding" },
          { key: "paid", label: "Paid", count: stats.paid, icon: <MdCheckCircle size={20} />, cls: "completed" },
          { key: "waived", label: "Waived", count: stats.waived, icon: <MdCancel size={20} />, cls: "scheduled" },
        ].map((s) => (
          <div className={`maintenance-stat-card ${filter === s.key ? "active" : ""}`} key={s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
            <div className={`maintenance-stat-icon ${s.cls} fines-stat-icon ${s.cls}`}>{s.icon}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">{s.key === "pending" && stats.totalPendingAmount > 0 ? `₱${stats.totalPendingAmount.toLocaleString()}` : s.count}</span>
              <span className="maintenance-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {outstandingFine && (
        <div className="fines-outstanding">
          <div className="fines-outstanding-header">
            <div className="fines-outstanding-icon"><MdWarning size={20} /></div>
            <div>
              <div className="fines-outstanding-title">Outstanding Fine</div>
              <div className="fines-outstanding-subtitle">You have {pendingCount} unpaid fine{pendingCount > 1 ? "s" : ""}</div>
            </div>
          </div>
          <div className="fines-outstanding-item">{outstandingFine.itemName}</div>
          <div className="fines-outstanding-detail">{outstandingFine.daysOverdue} days overdue</div>
          <div className="fines-outstanding-amount">₱{Number(outstandingFine.totalFine || 0).toLocaleString()}</div>
          <div className="fines-outstanding-actions">
            <button className="btn btn-sm btn-primary" onClick={() => setSelectedFine(outstandingFine)}>View Details</button>
          </div>
        </div>
      )}

      <div className="maintenance-toolbar">
        <div className="maintenance-filter-tabs">
          {["all", "pending", "paid", "waived"].map((f) => (
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "pending" ? "Unpaid" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          {(filter !== "all" || search) && (
            <button className="maintenance-filter-btn" onClick={() => { setFilter("all"); setSearch(""); }}>
              <MdClose size={12} /> Clear
            </button>
          )}
        </div>
        <div className="maintenance-toolbar-right">
          <div className="maintenance-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search equipment..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="maintenance-sort">
            <MdSort size={14} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="oldest">Most Overdue</option>
              <option value="newest">Newest First</option>
              <option value="amount">Highest Fine</option>
              <option value="amount-asc">Lowest Fine</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="maintenance-empty">
          <PesoIcon size={48} />
          <h3>{search || filter !== "all" ? "No Fine Records Found" : "No Fine Records"}</h3>
          <p>{search || filter !== "all" ? "No fine records match your current filters." : "You currently have no recorded fines."}</p>
        </div>
      ) : (
        <div className="fines-table-wrapper">
          <table className="fines-table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Due Date</th>
                <th>Return Date</th>
                <th>Days Overdue</th>
                <th>Fine Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((fine) => (
                <tr key={fine.id} onClick={() => setSelectedFine(fine)}>
                  <td style={{ fontWeight: 600 }}>{fine.itemName || "-"}</td>
                  <td>{fmtDate(fine.dueDate)}</td>
                  <td>{fine.returnedAt ? fmtDate(fine.returnedAt) : <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                  <td>{fine.daysOverdue || 0}d</td>
                  <td style={{ fontWeight: 600 }}>₱{Number(fine.totalFine || 0).toLocaleString()}</td>
                  <td><span className={`fines-status-badge fines-status-${fine.status}`}>{STATUS_LABELS[fine.status] || fine.status}</span></td>
                  <td>{fmtDate(fine.createdAt)}</td>
                  <td>
                    <button className="fines-view-btn" onClick={(e) => { e.stopPropagation(); setSelectedFine(fine); }}>
                      <MdVisibility size={12} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginationData && (
        <Pagination currentPage={paginationData.page} totalPages={paginationData.totalPages} totalItems={paginationData.total} pageSize={paginationData.limit} onPageChange={setPage} />
      )}
    </>
  );
}

function DetailModal({ fine, isAdmin, onClose, waiveReason, setWaiveReason, handlePay, handleWaive, processing }) {
  return (
    <Modal title="Fine Details" onClose={onClose}>
      <div className="fines-detail-modal">
        <div className="fines-detail-section">
          <div className="fines-detail-section-title">
            <div className="fines-detail-section-icon" style={{ background: "rgba(25,118,210,.08)", color: "#1976d2" }}><MdPerson size={14} /></div>
            {isAdmin ? "Borrower Information" : "Your Information"}
          </div>
          <div className="fines-detail-grid">
            <div className="fines-detail-row"><span className="fines-detail-label">Full Name</span><span className="fines-detail-value">{fine.userName || "Unknown"}</span></div>
            {isAdmin && <div className="fines-detail-row"><span className="fines-detail-label">User ID</span><span className="fines-detail-value" style={{ fontSize: 11 }}>{fine.userId || "-"}</span></div>}
            {fine.userRole && <div className="fines-detail-row"><span className="fines-detail-label">Role</span><span className="fines-detail-value" style={{ textTransform: "capitalize" }}>{fine.userRole}</span></div>}
            {fine.course && <div className="fines-detail-row"><span className="fines-detail-label">Course/Program</span><span className="fines-detail-value">{fine.course}</span></div>}
            {fine.schoolId && <div className="fines-detail-row"><span className="fines-detail-label">School ID</span><span className="fines-detail-value">{fine.schoolId}</span></div>}
          </div>
        </div>

        <div className="fines-detail-section">
          <div className="fines-detail-section-title">
            <div className="fines-detail-section-icon" style={{ background: "rgba(46,125,50,.08)", color: "#2e7d32" }}><MdAttachMoney size={14} /></div>
            Equipment Information
          </div>
          <div className="fines-detail-grid">
            <div className="fines-detail-row"><span className="fines-detail-label">Equipment Name</span><span className="fines-detail-value">{fine.itemName || "-"}</span></div>
            {fine.itemId && <div className="fines-detail-row"><span className="fines-detail-label">Equipment ID</span><span className="fines-detail-value" style={{ fontSize: 11 }}>{fine.itemId}</span></div>}
            {fine.transactionId && <div className="fines-detail-row"><span className="fines-detail-label">Transaction ID</span><span className="fines-detail-value" style={{ fontSize: 11 }}>{fine.transactionId}</span></div>}
          </div>
        </div>

        <div className="fines-detail-section">
          <div className="fines-detail-section-title">
            <div className="fines-detail-section-icon" style={{ background: "rgba(245,124,0,.08)", color: "#f57c00" }}><MdEventBusy size={14} /></div>
            Borrowing Information
          </div>
          <div className="fines-detail-grid">
            <div className="fines-detail-row"><span className="fines-detail-label">Borrow Date</span><span className="fines-detail-value">{fmtDate(fine.borrowedAt)}</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Due Date</span><span className="fines-detail-value">{fmtDate(fine.dueDate)}</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Return Date</span><span className="fines-detail-value">{fine.returnedAt ? fmtDate(fine.returnedAt) : "-"}</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Days Overdue</span><span className="fines-detail-value">{fine.daysOverdue || 0} days</span></div>
          </div>
        </div>

        <div className="fines-detail-section">
          <div className="fines-detail-section-title">
            <div className="fines-detail-section-icon" style={{ background: "rgba(211,47,47,.08)", color: "#d32f2f" }}><PesoIcon size={14} /></div>
            Fine Information
          </div>
          <div className="fines-detail-grid">
            <div className="fines-detail-row"><span className="fines-detail-label">Fine Rate</span><span className="fines-detail-value">₱{fine.finePerDay || 0}/day</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Fine Amount</span><span className="fines-detail-value highlight">₱{Number(fine.totalFine || 0).toLocaleString()}</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Status</span><span className={`fines-detail-value status-${fine.status}`}>{STATUS_LABELS[fine.status] || fine.status}</span></div>
            <div className="fines-detail-row"><span className="fines-detail-label">Date Created</span><span className="fines-detail-value">{fmtDateTime(fine.createdAt)}</span></div>
          </div>
        </div>

        {(fine.paidAt || fine.waivedAt) && (
          <div className="fines-detail-section">
            <div className="fines-detail-section-title">
              <div className="fines-detail-section-icon" style={{ background: "rgba(46,125,50,.08)", color: "#2e7d32" }}><MdCheckCircle size={14} /></div>
              Processing Information
            </div>
            <div className="fines-detail-grid">
              {fine.paidAt && <div className="fines-detail-row"><span className="fines-detail-label">Paid At</span><span className="fines-detail-value">{fmtDateTime(fine.paidAt)}</span></div>}
              {fine.paidBy && isAdmin && <div className="fines-detail-row"><span className="fines-detail-label">Processed By</span><span className="fines-detail-value" style={{ fontSize: 11 }}>{fine.paidBy}</span></div>}
              {fine.waivedAt && <div className="fines-detail-row"><span className="fines-detail-label">Waived At</span><span className="fines-detail-value">{fmtDateTime(fine.waivedAt)}</span></div>}
              {fine.waiveReason && <div className="fines-detail-row"><span className="fines-detail-label">Waiver Reason</span><span className="fines-detail-value">{fine.waiveReason}</span></div>}
            </div>
          </div>
        )}

        {isAdmin && fine.status === "pending" && (
          <div className="fines-detail-section">
            <div className="fines-detail-waive">
              <h5>Waive Fine</h5>
              <textarea
                placeholder="Reason for waiving (required)"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                rows={2}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", color: "var(--text)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={processing === fine.id || !waiveReason.trim()} onClick={() => handleWaive(fine.id)}>
                  {processing === fine.id ? "Processing..." : <><MdCancel size={14} /> Waive Fine</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
