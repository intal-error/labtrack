import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/ui/Modal";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";
import "../styles/pages/catalog.css";

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

export default function MyRequestsPage() {
  const { userProfile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getMyBorrowRequests();
      setRequests(data || []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    if (!confirm("Cancel this request?")) return;
    try {
      await api.cancelBorrowRequest(id);
      toast.success("Request cancelled");
      setSelectedRequest(null);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <section className="transactions-page">
      <div className="transactions-header">
        <div className="transactions-header-left">
          <h1>My Borrow Requests</h1>
          <p className="transactions-subtitle">Track your pending and processed borrow requests</p>
        </div>
      </div>

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
            {["all", "pending", "approved", "rejected", "cancelled"].map((f) => (
              <button key={f} className={`tab-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="catalog-view-toggle">
          <button className={`view-btn ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} title="Grid view">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button className={`view-btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} title="List view">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
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
                    <span className={`transaction-status-badge`} style={{ background: `${STATUS_COLORS[req.status]}20`, color: STATUS_COLORS[req.status] }}>
                      {STATUS_LABELS[req.status]}
                    </span>
                  </div>
                </div>
                <div className="transaction-card-details">
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
