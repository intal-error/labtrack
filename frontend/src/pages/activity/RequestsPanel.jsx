import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { timeAgo } from "../../utils/helpers";
import Modal from "../../components/ui/Modal";
import toast from "react-hot-toast";
import ViewToggle from "../../components/ui/ViewToggle";
import "../../styles/pages/tables.css";
import "../../styles/pages/catalog.css";

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

const FILTERS = ["all", "pending", "approved", "rejected", "cancelled"];

export default function RequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getMyBorrowRequests();
        if (cancelled) return;
        setRequests(data || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to load requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  function reload() {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  async function handleCancel(id) {
    if (!confirm("Cancel this request?")) return;
    try {
      await api.cancelBorrowRequest(id);
      toast.success("Request cancelled");
      setSelectedRequest(null);
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  }

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  if (error) return (
    <div className="tab-content">
      <div className="transactions-empty">
        <h3>Couldn&apos;t load your requests</h3>
        <p>{error}</p>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={reload}>Retry</button>
      </div>
    </div>
  );

  return (
    <section className="transactions-page activity-panel">
      <div className="transactions-stats">
        <div className="stat-card stat-active">
          <div className="stat-info">
            <span className="stat-number">{stats.pending}</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>
        <div className="stat-card stat-borrowed-total">
          <div className="stat-info">
            <span className="stat-number">{stats.approved}</span>
            <span className="stat-label">Approved</span>
          </div>
        </div>
        <div className="stat-card stat-returned-total">
          <div className="stat-info">
            <span className="stat-number">{stats.rejected}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
      </div>

      <div className="transactions-toolbar">
        <div className="transactions-toolbar-left">
          <div className="transactions-tabs">
            {FILTERS.map((f) => (
              <button key={f} className={`tab-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <select
            className="transactions-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter requests"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="transactions-toolbar-right">
          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-myrequests-view" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="transactions-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <h3>No requests found</h3>
          <p>Submit a borrow request from the scanner page.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="transactions-grid">
          {filtered.map((req) => (
            <div className="transaction-card" key={req.id}>
              <div className="transaction-card-accent accent-borrowed" />
              <div className="transaction-card-body">
                <div className="transaction-card-top">
                  <div className="transaction-card-info">
                    <h4 className="transaction-name">{req.itemName}</h4>
                    <p className="transaction-school-id">Qty: {req.quantity}</p>
                  </div>
                  <div className="transaction-card-badges">
                    <span className="transaction-status-badge" style={{ background: `${STATUS_COLORS[req.status]}20`, color: STATUS_COLORS[req.status] }}>
                      {STATUS_LABELS[req.status]}
                    </span>
                  </div>
                </div>
                <div className="transaction-card-details">
                  {req.equipment_course && req.course && req.equipment_course !== req.course && (
                    <div className="transaction-detail" style={{ color: "#f57c00", fontWeight: 600 }}>
                      <span>Cross-course: {req.course} → {req.equipment_course}</span>
                    </div>
                  )}
                  {req.assigned_admin_name && (
                    <div className="transaction-detail">
                      <span>Assigned Admin: {req.assigned_admin_name}</span>
                    </div>
                  )}
                  <div className="transaction-detail">
                    <span>Due: {req.dueDate ? new Date(req.dueDate?.toDate?.() || req.dueDate).toLocaleDateString() : "-"}</span>
                  </div>
                  <div className="transaction-detail">
                    <span>Submitted: {timeAgo(req.createdAt)}</span>
                  </div>
                  {req.purpose && (
                    <div className="transaction-detail">
                      <span>Purpose: {req.purpose}</span>
                    </div>
                  )}
                  {req.reviewNotes && (
                    <div className="transaction-detail">
                      <span>Notes: {req.reviewNotes}</span>
                    </div>
                  )}
                </div>
                <button className="btn btn-sm btn-view-info" onClick={() => setSelectedRequest(req)}>
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="catalog-table-wrapper">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Due Date</th>
                <th>Submitted</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr key={req.id} onClick={() => setSelectedRequest(req)} style={{ cursor: "pointer" }}>
                  <td>{req.itemName}</td>
                  <td>{req.quantity}</td>
                  <td>{req.dueDate ? new Date(req.dueDate?.toDate?.() || req.dueDate).toLocaleDateString() : "-"}</td>
                  <td>{timeAgo(req.createdAt)}</td>
                  <td>{req.purpose || "-"}</td>
                  <td><span className="badge" style={{ background: `${STATUS_COLORS[req.status]}20`, color: STATUS_COLORS[req.status] }}>{STATUS_LABELS[req.status]}</span></td>
                  <td>
                    <button className="btn btn-sm btn-view-info" onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRequest && (
        <Modal title="Request Details" onClose={() => setSelectedRequest(null)}>
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Item</span>
                  <span className="txn-detail-value">{selectedRequest.itemName}</span>
                </div>
                {selectedRequest.equipment_course && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Equipment Course</span>
                    <span className="txn-detail-value">
                      {selectedRequest.equipment_course}
                      {selectedRequest.equipment_course !== selectedRequest.course && (
                        <span style={{ color: "#f57c00", fontSize: 11, marginLeft: 6 }}>(Cross-course)</span>
                      )}
                    </span>
                  </div>
                )}
                {selectedRequest.assigned_admin_name && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Assigned Admin</span>
                    <span className="txn-detail-value">{selectedRequest.assigned_admin_name}</span>
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
              </div>
            </div>
            {selectedRequest.status === "pending" && (
              <div className="form-actions">
                <button className="btn btn-danger" onClick={() => handleCancel(selectedRequest.id)}>
                  Cancel Request
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
