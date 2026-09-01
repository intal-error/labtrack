import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import Pagination from "../ui/Pagination";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import "../../styles/pages/catalog.css";
import { MdAssignment, MdSearch, MdCheckCircle, MdCancel, MdSchedule, MdPerson, MdInventory, MdSort, MdSwapHoriz } from "react-icons/md";
import PageHero from "../ui/PageHero";
import ViewToggle from "../ui/ViewToggle";

const PAGE_SIZE = 25;

const STATUS_COLORS = {
  pending: "#f57c00",
  approved: "#43A047",
  rejected: "#d32f2f",
  cancelled: "#757575",
};

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function timeAgo(date) {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getDueDateInfo(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffMs = due - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, cls: "date-overdue", days: diffDays };
  if (diffDays === 0) return { label: "Due today", cls: "date-today", days: 0 };
  if (diffDays <= 3) return { label: `Due in ${diffDays}d`, cls: "date-urgent", days: diffDays };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, cls: "date-soon", days: diffDays };
  return { label: `Due in ${diffDays}d`, cls: "date-normal", days: diffDays };
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function BorrowRequestsTab() {
  const { role, userProfile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);
  // Reassignment state
  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignAdminId, setReassignAdminId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);

  useEffect(() => { load(); }, [page, filter, search]);

  async function load() {
    try {
      const params = new URLSearchParams();
      params.set("page", page);
      params.set("limit", PAGE_SIZE);
      if (search.trim()) params.set("search", search.trim());
      if (filter !== "all") params.set("status", filter);

      const [reqsResult, cat, adminList] = await Promise.all([
        api.getBorrowRequests(params.toString()),
        api.getCatalog(),
        api.getActiveAdmins().catch(() => []),
      ]);

      if (Array.isArray(reqsResult)) {
        setRequests(reqsResult);
        setPaginationData(null);
      } else if (reqsResult && reqsResult.data) {
        setRequests(reqsResult.data);
        setPaginationData(reqsResult.pagination || null);
      } else {
        setRequests([]);
        setPaginationData(null);
      }

      setCatalog(Array.isArray(cat) ? cat : []);
      setAdmins(Array.isArray(adminList) ? adminList : []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  const catalogImageMap = useMemo(() => {
    const map = {};
    catalog.forEach((item) => { map[item.id] = item.imageUrl || ""; });
    return map;
  }, [catalog]);

  function handleFilterChange(newFilter) {
    setFilter(newFilter);
    setPage(1);
  }

  function handleSearchChange(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  async function handleApprove(id) {
    setProcessing(id);
    try {
      await api.approveBorrowRequest(id, reviewNotes);
      toast.success("Request approved");
      setSelectedRequest(null);
      setReviewNotes("");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(id) {
    if (!reviewNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setProcessing(id);
    try {
      await api.rejectBorrowRequest(id, reviewNotes);
      toast.success("Request rejected");
      setSelectedRequest(null);
      setReviewNotes("");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to reject");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReassign() {
    if (!reassignAdminId || !reassignTarget) return;
    setReassignLoading(true);
    try {
      await api.reassignBorrowRequest(reassignTarget.id, {
        newAdminId: reassignAdminId,
        reason: reassignReason,
      });
      toast.success("Request reassigned");
      setReassignTarget(null);
      setReassignAdminId("");
      setReassignReason("");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to reassign");
    } finally {
      setReassignLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    const overdue = requests.filter((r) => {
      if (r.status === "rejected" || r.status === "cancelled" || r.status === "returned") return false;
      const info = getDueDateInfo(toDate(r.dueDate));
      return info && info.days < 0;
    }).length;
    return { total, pending, approved, rejected, overdue };
  }, [requests]);

  const filtered = useMemo(() => {
    let result = [...requests].sort((a, b) => {
      if (sortBy === "oldest") return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
      if (sortBy === "due-date") {
        const aDue = toDate(a.dueDate)?.getTime() || Infinity;
        const bDue = toDate(b.dueDate)?.getTime() || Infinity;
        return aDue - bDue;
      }
      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    });
    return result;
  }, [requests, sortBy]);

  const totalPages = paginationData ? paginationData.totalPages : 1;
  const totalItems = paginationData ? paginationData.total : requests.length;

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <PageHero icon={MdAssignment} title="Borrow Requests" />

      <div className="maintenance-stats">
        {[
          { key: "total", label: "Total", count: stats.total, icon: <MdAssignment size={20} /> },
          { key: "pending", label: "Pending", count: stats.pending, icon: <MdSchedule size={20} /> },
          { key: "approved", label: "Approved", count: stats.approved, icon: <MdCheckCircle size={20} /> },
          { key: "rejected", label: "Rejected", count: stats.rejected, icon: <MdCancel size={20} /> },
        ].map((s) => (
          <div className={`maintenance-stat-card ${filter === s.key ? "active" : ""}`} key={s.key} onClick={() => handleFilterChange(filter === s.key ? "all" : s.key)}>
            <div className={`maintenance-stat-icon ${s.key}`}>{s.icon}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">{s.count}</span>
              <span className="maintenance-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="maintenance-toolbar">
        <div className="maintenance-filter-tabs">
          {["all", "pending", "approved", "rejected", "cancelled"].map((f) => (
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => handleFilterChange(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="maintenance-toolbar-right">
          <div className="maintenance-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search name, item, ID..." value={search} onChange={handleSearchChange} />
          </div>
          <div className="maintenance-sort">
            <MdSort size={14} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="due-date">Due Date</option>
            </select>
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-borrow-requests-view" />
        </div>
      </div>

      {stats.overdue > 0 && (
        <div className="borrow-overdue-banner">
          <span className="overdue-pulse" />
          <strong>{stats.overdue}</strong> request{stats.overdue > 1 ? "s" : ""} overdue
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="maintenance-empty">
          <MdAssignment size={48} />
          <h3>{search || filter !== "all" ? "No matching requests" : "No borrow requests"}</h3>
          <p>Requests from students will appear here.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="maintenance-list">
          {filtered.map((req) => {
            const dueInfo = getDueDateInfo(toDate(req.dueDate));
            const thumb = catalogImageMap[req.catalogId];
            const isCrossCourse = req.equipment_course && req.course && req.equipment_course !== req.course;
            return (
              <div className={`maintenance-card ${dueInfo && dueInfo.days < 0 && req.status !== "rejected" && req.status !== "cancelled" ? "card-overdue" : ""}`} key={req.id} onClick={() => setSelectedRequest(req)}>
                <div className="maintenance-card-header">
                  <div className="maintenance-card-title">
                    {thumb ? (
                      <img src={thumb} alt="" className="borrow-thumb" />
                    ) : (
                      <MdPerson size={18} />
                    )}
                    <span>{req.firstName} {req.lastName}</span>
                  </div>
                  <div className="maintenance-card-badges">
                    <span className="badge" style={{ background: `${STATUS_COLORS[req.status] || "#666"}20`, color: STATUS_COLORS[req.status] || "#666" }}>
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                  </div>
                </div>
                <div className="maintenance-card-body">
                  <div className="maintenance-meta">
                    <span className="maintenance-type-badge preventive">
                      <MdInventory size={14} /> {req.itemName}
                    </span>
                    <span className="maintenance-date-badge">
                      Qty: {req.quantity}
                    </span>
                    <span className="maintenance-date-badge" style={{ background: "rgba(46,125,50,.1)", color: "#2e7d32", fontWeight: 600 }}>
                      {req.targetCourse || req.equipment_course || req.course || ""}
                    </span>
                    <span className="maintenance-assigned">
                      <MdSchedule size={14} /> {timeAgo(req.createdAt)}
                    </span>
                  </div>
                  {isCrossCourse && (
                    <div className="cross-course-badge" style={{ color: "#f57c00", fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                      Cross-course: Student {req.course} borrowing {req.equipment_course} equipment
                    </div>
                  )}
                  {req.assigned_admin_name && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      Assigned to: <strong>{req.assigned_admin_name}</strong>
                    </div>
                  )}
                  {req.purpose && <p className="maintenance-desc">Purpose: {req.purpose}</p>}
                  <div className="maintenance-meta">
                    {dueInfo && (
                      <span className={`maintenance-date-badge ${dueInfo.cls}`}>
                        {dueInfo.label}
                      </span>
                    )}
                    {req.course && <span className="maintenance-assigned">{req.course}{req.year ? ` - ${req.year}` : ""}</span>}
                  </div>
                </div>
                {req.status === "pending" && role === "admin" && (
                  <div className="maintenance-card-actions">
                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}>
                      <MdCheckCircle size={14} /> Review
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setReassignTarget(req); }} title="Reassign">
                      <MdSwapHoriz size={14} /> Reassign
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="catalog-table-wrapper">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>School ID</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Target Course</th>
                <th>Assigned Admin</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => {
                const dueInfo = getDueDateInfo(toDate(req.dueDate));
                const isCrossCourse = req.equipment_course && req.course && req.equipment_course !== req.course;
                return (
                  <tr key={req.id} onClick={() => setSelectedRequest(req)} style={{ cursor: "pointer" }}>
                    <td>{req.firstName} {req.lastName}</td>
                    <td>{req.schoolID || "-"}</td>
                    <td>{req.itemName}</td>
                    <td>{req.quantity}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--green)" }}>
                        {req.targetCourse || req.equipment_course || req.course || "-"}
                      </span>
                    </td>
                    <td>{req.assigned_admin_name || <span style={{ color: "var(--text-muted)" }}>Unassigned</span>}</td>
                    <td>
                      <span className={dueInfo ? `maintenance-date-badge ${dueInfo.cls}` : ""}>
                        {req.dueDate ? new Date(req.dueDate?.toDate?.() || req.dueDate).toLocaleDateString() : "-"}
                        {dueInfo && <small style={{ marginLeft: 6, fontSize: 10 }}>({dueInfo.label})</small>}
                      </span>
                    </td>
                    <td><span className="badge" style={{ background: `${STATUS_COLORS[req.status] || "#666"}20`, color: STATUS_COLORS[req.status] || "#666" }}>{STATUS_LABELS[req.status] || req.status}</span></td>
                    <td>
                      {req.status === "pending" && role === "admin" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}>Review</button>
                          <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setReassignTarget(req); }} title="Reassign">
                            <MdSwapHoriz size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Request Detail Modal */}
      {selectedRequest && (
        <Modal title="Borrow Request Details" onClose={() => { setSelectedRequest(null); setReviewNotes(""); }}>
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Borrower</span>
                  <span className="txn-detail-value">{selectedRequest.firstName} {selectedRequest.lastName}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">School ID</span>
                  <span className="txn-detail-value">{selectedRequest.schoolID || "-"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Student Course</span>
                  <span className="txn-detail-value">{selectedRequest.course || "-"}{selectedRequest.year ? ` - ${selectedRequest.year}` : ""}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Item</span>
                  <span className="txn-detail-value">{selectedRequest.itemName}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Target Course</span>
                  <span className="txn-detail-value" style={{ fontWeight: 700, color: "var(--green)" }}>
                    {selectedRequest.targetCourse || selectedRequest.equipment_course || "-"}
                  </span>
                </div>
                {selectedRequest.equipment_course && selectedRequest.targetCourse && selectedRequest.equipment_course !== selectedRequest.targetCourse && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Equipment Course</span>
                    <span className="txn-detail-value">
                      {selectedRequest.equipment_course}
                      <span style={{ color: "#f57c00", fontSize: 11, marginLeft: 6 }}>(Different from target)</span>
                    </span>
                  </div>
                )}
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Quantity</span>
                  <span className="txn-detail-value">{selectedRequest.quantity}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Due Date</span>
                  <span className="txn-detail-value">
                    {selectedRequest.dueDate ? new Date(selectedRequest.dueDate?.toDate?.() || selectedRequest.dueDate).toLocaleDateString() : "-"}
                  </span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Purpose</span>
                  <span className="txn-detail-value">{selectedRequest.purpose || "-"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Status</span>
                  <span className="txn-detail-value" style={{ color: STATUS_COLORS[selectedRequest.status], fontWeight: 600 }}>
                    {STATUS_LABELS[selectedRequest.status]}
                  </span>
                </div>
                {selectedRequest.assigned_admin_name && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Assigned Admin</span>
                    <span className="txn-detail-value">{selectedRequest.assigned_admin_name}</span>
                  </div>
                )}
                {selectedRequest.reviewerName && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Reviewed By</span>
                    <span className="txn-detail-value">{selectedRequest.reviewerName}</span>
                  </div>
                )}
                {selectedRequest.reviewNotes && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Review Notes</span>
                    <span className="txn-detail-value">{selectedRequest.reviewNotes}</span>
                  </div>
                )}
                {selectedRequest.reassignment_history && selectedRequest.reassignment_history.length > 0 && (
                  <div className="txn-detail-row" style={{ gridColumn: "1 / -1" }}>
                    <span className="txn-detail-label">Reassignment History</span>
                    <div className="txn-detail-value">
                      {selectedRequest.reassignment_history.map((entry, i) => (
                        <div key={i} style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>
                          {entry.previousAdminName || "Unassigned"} → <strong>{entry.newAdminName}</strong> by {entry.reassignedByName} ({toDate(entry.date)?.toLocaleDateString()})
                          {entry.reason && ` — ${entry.reason}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {selectedRequest.status === "pending" && role === "admin" && (
              <div className="txn-detail-section">
                <h5>Review Request</h5>
                <div className="form-group">
                  <textarea
                    placeholder="Review notes (required for rejection)"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={processing === selectedRequest.id}
                  >
                    <MdCheckCircle size={14} /> {processing === selectedRequest.id ? "Processing..." : "Approve"}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={processing === selectedRequest.id}
                  >
                    <MdCancel size={14} /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Reassignment Modal */}
      {reassignTarget && (
        <Modal title="Reassign Request" onClose={() => { setReassignTarget(null); setReassignAdminId(""); setReassignReason(""); }}>
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Request</span>
                  <span className="txn-detail-value">{reassignTarget.firstName} {reassignTarget.lastName} — {reassignTarget.itemName}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Current Admin</span>
                  <span className="txn-detail-value">{reassignTarget.assigned_admin_name || "Unassigned"}</span>
                </div>
              </div>
            </div>
            <div className="txn-detail-section">
              <h5>Reassign to:</h5>
              <div className="form-group">
                <select value={reassignAdminId} onChange={(e) => setReassignAdminId(e.target.value)}>
                  <option value="">Select admin...</option>
                  {admins.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.firstName} {admin.lastName} {(() => { const c = admin.assignedCourses || (admin.assignedCourse ? [admin.assignedCourse] : []); return c.length > 0 ? `(${c.join(", ")})` : ""; })()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <textarea
                  placeholder="Reason for reassignment (optional)"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleReassign}
                  disabled={!reassignAdminId || reassignLoading}
                >
                  <MdSwapHoriz size={14} /> {reassignLoading ? "Reassigning..." : "Reassign"}
                </button>
                <button className="btn btn-secondary" onClick={() => { setReassignTarget(null); setReassignAdminId(""); setReassignReason(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
