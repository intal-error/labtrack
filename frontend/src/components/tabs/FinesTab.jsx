import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import { filterBySearch } from "../../utils/search";
import "../../styles/pages/tabs.css";
import { MdAttachMoney, MdSearch, MdCheckCircle, MdCancel, MdWarning, MdSort, MdPerson } from "react-icons/md";

const STATUS_COLORS = {
  pending: "#f57c00",
  paid: "#43A047",
  waived: "#1976d2",
};

const STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  waived: "Waived",
};

export default function FinesTab() {
  const { role } = useAuth();
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedFine, setSelectedFine] = useState(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [sortBy, setSortBy] = useState("oldest");
  const [processing, setProcessing] = useState(null);

  useEffect(() => { if (role) load(); }, [role]);

  async function load() {
    try {
      const data = role === "admin" ? await api.getFines() : await api.getMyFines();
      setFines(data || []);
    } catch {
      toast.error("Failed to load fines");
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(id) {
    if (!confirm("Mark this fine as paid?")) return;
    setProcessing(id);
    try {
      await api.payFine(id);
      toast.success("Fine marked as paid");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update fine");
    } finally {
      setProcessing(null);
    }
  }

  async function handleWaive(id) {
    setProcessing(id);
    try {
      await api.waiveFine(id, waiveReason);
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
    const pending = fines.filter((f) => f.status === "pending").length;
    const paid = fines.filter((f) => f.status === "paid").length;
    const waived = fines.filter((f) => f.status === "waived").length;
    const totalPendingAmount = fines
      .filter((f) => f.status === "pending")
      .reduce((sum, f) => sum + (Number(f.totalFine) || 0), 0);
    return { total, pending, paid, waived, totalPendingAmount };
  }, [fines]);

  const filtered = useMemo(() => {
    let result = fines;
    if (filter !== "all") result = result.filter((f) => f.status === filter);
    if (search.trim()) result = filterBySearch(result, search, ["itemName", "userName", "userId"]);
    result = [...result].sort((a, b) => {
      if (sortBy === "newest") {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return db - da;
      }
      if (sortBy === "amount") return (Number(b.totalFine) || 0) - (Number(a.totalFine) || 0);
      if (sortBy === "name") return (a.itemName || "").localeCompare(b.itemName || "");
      return (Number(b.daysOverdue) || 0) - (Number(a.daysOverdue) || 0);
    });
    return result;
  }, [fines, filter, search, sortBy]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdAttachMoney size={22} /> Fine Management</h2>
      </div>

      <div className="maintenance-stats">
        {[
          { key: "total", label: "Total Fines", count: stats.total, icon: <MdAttachMoney size={20} /> },
          { key: "pending", label: "Pending", count: stats.pending, icon: <MdWarning size={20} /> },
          { key: "paid", label: "Paid", count: stats.paid, icon: <MdCheckCircle size={20} /> },
          { key: "waived", label: "Waived", count: stats.waived, icon: <MdCancel size={20} /> },
        ].map((s) => (
          <div className={`maintenance-stat-card ${filter === s.key ? "active" : ""}`} key={s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
            <div className={`maintenance-stat-icon ${s.key}`}>{s.icon}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">{s.key === "pending" ? `₱${stats.totalPendingAmount}` : s.count}</span>
              <span className="maintenance-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="maintenance-toolbar">
        <div className="maintenance-filter-tabs">
          {["all", "pending", "paid", "waived"].map((f) => (
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="maintenance-toolbar-right">
          <div className="maintenance-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search item, user..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="maintenance-sort">
            <MdSort size={14} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="oldest">Most Overdue</option>
              <option value="newest">Newest First</option>
              <option value="amount">Highest Amount</option>
              <option value="name">Item Name</option>
            </select>
          </div>
        </div>
      </div>

      <div className="maintenance-list">
        {filtered.length === 0 ? (
          <div className="maintenance-empty">
            <MdAttachMoney size={48} />
            <h3>{search || filter !== "all" ? "No matching fines" : "No fines recorded"}</h3>
            <p>Fines are automatically created when items are overdue.</p>
          </div>
        ) : filtered.map((fine) => (
          <div className="maintenance-card" key={fine.id} onClick={() => setSelectedFine(fine)}>
            <div className="maintenance-card-header">
              <div className="maintenance-card-title">
                <MdAttachMoney size={18} />
                <span>{fine.itemName}</span>
              </div>
              <div className="maintenance-card-badges">
                <span className="badge" style={{ background: `${STATUS_COLORS[fine.status] || "#666"}20`, color: STATUS_COLORS[fine.status] || "#666" }}>
                  {STATUS_LABELS[fine.status] || fine.status}
                </span>
              </div>
            </div>
            <div className="maintenance-card-body">
              <div className="maintenance-meta">
                <span className="maintenance-type-badge pending">
                  <MdPerson size={14} /> {fine.userName || "Unknown"}
                </span>
                <span className="maintenance-type-badge pending">
                  <MdWarning size={14} /> {fine.daysOverdue} days overdue
                </span>
                <span className="maintenance-date-badge">
                  <MdAttachMoney size={14} /> ₱{fine.totalFine} ({fine.daysOverdue}d × ₱{fine.finePerDay}/day)
                </span>
              </div>
              {fine.createdAt && (
                <p className="maintenance-desc">Issued: {new Date(fine.createdAt?.toDate?.() || fine.createdAt).toLocaleDateString()}</p>
              )}
            </div>
            {fine.status === "pending" && role === "admin" && (
              <div className="maintenance-card-actions">
                <button className="btn btn-sm btn-primary" disabled={processing === fine.id} onClick={(e) => { e.stopPropagation(); handlePay(fine.id); }}>
                  {processing === fine.id ? "Processing..." : <><MdCheckCircle size={14} /> Mark Paid</>}
                </button>
                <button className="btn btn-sm btn-outline" disabled={processing === fine.id} onClick={(e) => { e.stopPropagation(); setSelectedFine(fine); }}>
                  <MdCancel size={14} /> Waive
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedFine && (
        <Modal title="Fine Details" onClose={() => { setSelectedFine(null); setWaiveReason(""); }}>
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Item</span>
                  <span className="txn-detail-value">{selectedFine.itemName}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Borrower</span>
                  <span className="txn-detail-value">{selectedFine.userName || selectedFine.userId || "Unknown"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Days Overdue</span>
                  <span className="txn-detail-value">{selectedFine.daysOverdue} days</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Fine Per Day</span>
                  <span className="txn-detail-value">₱{selectedFine.finePerDay}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Total Fine</span>
                  <span className="txn-detail-value" style={{ color: "var(--red)", fontWeight: 600 }}>₱{selectedFine.totalFine}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Status</span>
                  <span className="txn-detail-value" style={{ color: STATUS_COLORS[selectedFine.status], fontWeight: 600 }}>
                    {STATUS_LABELS[selectedFine.status]}
                  </span>
                </div>
                {selectedFine.paidAt && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Paid At</span>
                    <span className="txn-detail-value">{new Date(selectedFine.paidAt?.toDate?.() || selectedFine.paidAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedFine.waivedAt && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Waived At</span>
                    <span className="txn-detail-value">{new Date(selectedFine.waivedAt?.toDate?.() || selectedFine.waivedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedFine.waiveReason && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Waive Reason</span>
                    <span className="txn-detail-value">{selectedFine.waiveReason}</span>
                  </div>
                )}
              </div>
            </div>
            {selectedFine.status === "pending" && role === "admin" && (
              <div className="txn-detail-section">
                <h5>Waive Fine</h5>
                <div className="form-group">
                  <textarea
                    placeholder="Reason for waiving (optional)"
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary" onClick={() => handleWaive(selectedFine.id)}>
                    <MdCancel size={14} /> Waive Fine
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
