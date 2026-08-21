import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdAssignment, MdSearch, MdCheckCircle, MdCancel, MdSchedule, MdPerson, MdInventory } from "react-icons/md";

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

export default function BorrowRequestsTab() {
  const { role, userProfile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getBorrowRequests();
      setRequests(data || []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
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

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [requests]);

  const filtered = useMemo(() => {
    let result = requests;
    if (filter !== "all") result = result.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.firstName || "").toLowerCase().includes(q) ||
        (r.lastName || "").toLowerCase().includes(q) ||
        (r.itemName || "").toLowerCase().includes(q) ||
        (r.schoolID || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [requests, filter, search]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdAssignment size={22} /> Borrow Requests</h2>
      </div>

      <div className="maintenance-stats">
        {[
          { key: "total", label: "Total", count: stats.total, icon: <MdAssignment size={20} /> },
          { key: "pending", label: "Pending", count: stats.pending, icon: <MdSchedule size={20} /> },
          { key: "approved", label: "Approved", count: stats.approved, icon: <MdCheckCircle size={20} /> },
          { key: "rejected", label: "Rejected", count: stats.rejected, icon: <MdCancel size={20} /> },
        ].map((s) => (
          <div className={`maintenance-stat-card ${filter === s.key ? "active" : ""}`} key={s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
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
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="maintenance-search">
          <MdSearch size={16} />
          <input type="text" placeholder="Search name, item, ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="maintenance-list">
        {filtered.length === 0 ? (
          <div className="maintenance-empty">
            <MdAssignment size={48} />
            <h3>{search || filter !== "all" ? "No matching requests" : "No borrow requests"}</h3>
            <p>Requests from students will appear here.</p>
          </div>
        ) : filtered.map((req) => (
          <div className="maintenance-card" key={req.id} onClick={() => setSelectedRequest(req)}>
            <div className="maintenance-card-header">
              <div className="maintenance-card-title">
                <MdPerson size={18} />
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
                <span className="maintenance-assigned">
                  <MdSchedule size={14} /> {timeAgo(req.createdAt)}
                </span>
              </div>
              {req.purpose && <p className="maintenance-desc">Purpose: {req.purpose}</p>}
              <div className="maintenance-meta">
                <span className="maintenance-date-badge">
                  Due: {req.dueDate ? new Date(req.dueDate?.toDate?.() || req.dueDate).toLocaleDateString() : "-"}
                </span>
                {req.course && <span className="maintenance-assigned">{req.course}</span>}
              </div>
            </div>
            {req.status === "pending" && (role === "admin" || role === "faculty") && (
              <div className="maintenance-card-actions">
                <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}>
                  <MdCheckCircle size={14} /> Review
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

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
                  <span className="txn-detail-label">Course</span>
                  <span className="txn-detail-value">{selectedRequest.course || "-"}</span>
                </div>
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
            {selectedRequest.status === "pending" && (role === "admin" || role === "faculty") && (
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
    </div>
  );
}
