import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import { filterBySearch } from "../../utils/search";
import "../../styles/pages/tabs.css";
import "../../styles/pages/catalog.css";
import { MdBuild, MdAdd, MdEdit, MdDelete, MdCalendarToday, MdWarning, MdSearch, MdCheckCircle, MdSchedule, MdPlayArrow, MdAssignment, MdCameraAlt, MdImage, MdGridOn, MdList } from "react-icons/md";

const STATUS_COLORS = {
  scheduled: "#1976d2",
  "in-progress": "#f57c00",
  completed: "#43A047",
};

const PRIORITY_COLORS = {
  low: "#43A047",
  medium: "#f57c00",
  high: "#d32f2f",
  critical: "#b71c1c",
};

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const TYPE_LABELS = { preventive: "Preventive", corrective: "Corrective" };

function getRelativeDate(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, className: "date-overdue" };
  if (diffDays === 0) return { text: "Due today", className: "date-today" };
  if (diffDays <= 3) return { text: `In ${diffDays}d`, className: "date-urgent" };
  if (diffDays <= 7) return { text: `In ${diffDays}d`, className: "date-soon" };
  return { text: `In ${diffDays}d`, className: "date-normal" };
}

function getDateBorderStyle(item) {
  if (item.status === "completed") return "";
  if (!item.scheduledDate) return "";
  const rel = getRelativeDate(item.scheduledDate);
  if (!rel) return "";
  if (rel.className === "date-overdue") return "card-overdue";
  if (rel.className === "date-today" || rel.className === "date-urgent") return "card-urgent";
  return "";
}

const STAT_ICONS = {
  total: <MdAssignment size={20} />,
  scheduled: <MdSchedule size={20} />,
  "in-progress": <MdPlayArrow size={20} />,
  completed: <MdCheckCircle size={20} />,
};

export default function MaintenanceTab() {
  const { role } = useAuth();
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ catalogId: "", itemName: "", type: "preventive", description: "", status: "scheduled", scheduledDate: "", assignedTo: "", priority: "medium", photoURL: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [m, c] = await Promise.all([api.getMaintenance(), api.getCatalog()]);
      setItems(m);
      setCatalog(c);
    } catch {
      toast.error("Failed to load maintenance data");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ catalogId: "", itemName: "", type: "preventive", description: "", status: "scheduled", scheduledDate: "", assignedTo: "", priority: "medium", photoURL: "" });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      catalogId: item.catalogId || "",
      itemName: item.itemName || "",
      type: item.type || "preventive",
      description: item.description || "",
      status: item.status || "scheduled",
      scheduledDate: item.scheduledDate ? new Date(item.scheduledDate).toISOString().split("T")[0] : "",
      assignedTo: item.assignedTo || "",
      priority: item.priority || "medium",
      photoURL: item.photoURL || "",
    });
    setEditing(item.id);
    setShowForm(true);
  }

  function handleItemChange(catalogId) {
    const item = catalog.find((c) => c.id === catalogId);
    setForm((f) => ({ ...f, catalogId, itemName: item ? item.itemName : "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const data = { ...form, scheduledDate: form.scheduledDate ? new Date(form.scheduledDate) : null };
      if (editing) {
        await api.updateMaintenance(editing, data);
        toast.success("Maintenance updated");
      } else {
        await api.createMaintenance(data);
        toast.success("Maintenance scheduled");
      }
      setShowForm(false);
      load();
    } catch {
      toast.error("Failed to save maintenance");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this maintenance record?")) return;
    try {
      await api.deleteMaintenance(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, photoURL: url }));
      toast.success("Photo uploaded!");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function updateStatus(id, status) {
    try {
      await api.updateMaintenance(id, { status });
      toast.success("Status updated");
      setSelectedItem(null);
      load();
    } catch {
      toast.error("Failed to update");
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const scheduled = items.filter((i) => i.status === "scheduled").length;
    const inProgress = items.filter((i) => i.status === "in-progress").length;
    const completed = items.filter((i) => i.status === "completed").length;
    const overdue = items.filter((i) => {
      if (i.status === "completed" || !i.scheduledDate) return false;
      const rel = getRelativeDate(i.scheduledDate);
      return rel?.className === "date-overdue";
    }).length;
    return { total, scheduled, "in-progress": inProgress, completed, overdue };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") {
      result = result.filter((i) => i.status === filter);
    }
    if (search.trim()) result = filterBySearch(result, search, ["itemName", "assignedTo", "description"]);
    result.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      const aDate = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
      const bDate = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      const aPri = PRIORITY_ORDER[a.priority] ?? 2;
      const bPri = PRIORITY_ORDER[b.priority] ?? 2;
      return aPri - bPri;
    });
    return result;
  }, [items, filter, search]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdBuild size={22} /> Maintenance Scheduling</h2>
        {role === "admin" && (
          <button className="btn btn-primary" onClick={openCreate}><MdAdd size={16} /> Schedule Maintenance</button>
        )}
      </div>

      <div className="maintenance-stats">
        {["total", "scheduled", "in-progress", "completed"].map((key) => (
          <div className={`maintenance-stat-card ${filter === key ? "active" : ""}`} key={key} onClick={() => setFilter(filter === key ? "all" : key)}>
            <div className={`maintenance-stat-icon ${key}`}>{STAT_ICONS[key]}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">
                {stats[key]}
                {key === "total" && stats.overdue > 0 && (
                  <span className="maintenance-overdue-badge">{stats.overdue} overdue</span>
                )}
              </span>
              <span className="maintenance-stat-label">{key === "in-progress" ? "In Progress" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="maintenance-toolbar">
        <div className="maintenance-filter-tabs">
          {["all", "scheduled", "in-progress", "completed"].map((f) => (
            <button key={f} className={`maintenance-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "in-progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="maintenance-toolbar-right">
          <div className="maintenance-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search items, technician..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="catalog-view-toggle">
            <button className={`view-btn ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} title="Grid view">
              <MdGridOn size={16} />
            </button>
            <button className={`view-btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} title="List view">
              <MdList size={16} />
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Maintenance" : "Schedule Maintenance"}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Lab Item</label>
                <select value={form.catalogId} onChange={(e) => handleItemChange(e.target.value)} required>
                  <option value="">Select item</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.itemName}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="preventive">Preventive</option>
                    <option value="corrective">Corrective</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Scheduled Date</label>
                  <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the maintenance task..." />
              </div>
              <div className="form-group">
                <label>Assigned To</label>
                <input type="text" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Technician name" />
              </div>
              <div className="form-group">
                <label>Photo (optional)</label>
                <div className="maintenance-photo-upload">
                  {form.photoURL ? (
                    <div className="maintenance-photo-preview">
                      <img src={form.photoURL} alt="Maintenance" />
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setForm((f) => ({ ...f, photoURL: "" }))}>Remove</button>
                    </div>
                  ) : (
                    <label className="maintenance-photo-btn">
                      <MdCameraAlt size={18} /> {uploading ? "Uploading..." : "Add Photo"}
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden disabled={uploading} />
                    </label>
                  )}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Update" : "Schedule"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stats.overdue > 0 && (
        <div className="borrow-overdue-banner">
          <span className="overdue-pulse" />
          <strong>{stats.overdue}</strong> maintenance task{stats.overdue > 1 ? "s" : ""} overdue
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="maintenance-empty">
          <MdBuild size={48} />
          <h3>{search || filter !== "all" ? "No matching records" : "No maintenance scheduled"}</h3>
          <p>{search || filter !== "all" ? "Try adjusting your search or filter" : "Click 'Schedule Maintenance' to create your first record"}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="catalog-grid">
          {filtered.map((item) => {
            const relDate = getRelativeDate(item.scheduledDate);
            return (
              <div className="catalog-card" key={item.id} onClick={() => setSelectedItem(item)}>
                {item.photoURL && (
                  <div className="catalog-card-image">
                    <img src={item.photoURL} alt={item.itemName} />
                  </div>
                )}
                <div className="catalog-card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <h4 className="catalog-card-title" style={{ margin: 0 }}>{item.itemName}</h4>
                    <span className="maintenance-priority-badge" style={{ background: `${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium}20`, color: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium, flexShrink: 0 }}>
                      {item.priority || "medium"}
                    </span>
                  </div>
                  <div className="catalog-card-meta">
                    <span className={`condition-badge ${item.type === "preventive" ? "cond-good" : "cond-fair"}`}>{TYPE_LABELS[item.type] || item.type}</span>
                    <span className="badge" style={{ background: `${STATUS_COLORS[item.status] || "#666"}20`, color: STATUS_COLORS[item.status] || "#666" }}>
                      {item.status === "in-progress" ? "In Progress" : item.status}
                    </span>
                  </div>
                  {relDate && item.status !== "completed" && (
                    <span className={`maintenance-date-badge ${relDate.className}`} style={{ marginBottom: 6, display: "inline-block" }}>{relDate.text}</span>
                  )}
                  {item.assignedTo && <p className="catalog-card-desc" style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Assigned: {item.assignedTo}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="maintenance-list">
          {filtered.map((item) => {
            const relDate = getRelativeDate(item.scheduledDate);
            const dateStyle = getDateBorderStyle(item);
            return (
              <div className={`maintenance-card ${dateStyle}`} key={item.id} onClick={() => setSelectedItem(item)}>
                {item.photoURL && (
                  <div className="maintenance-card-photo">
                    <img src={item.photoURL} alt={item.itemName} />
                  </div>
                )}
                <div className="maintenance-card-header">
                  <div className="maintenance-card-title">
                    <MdBuild size={18} />
                    <span>{item.itemName}</span>
                  </div>
                  <div className="maintenance-card-badges">
                    <span className="maintenance-priority-badge" style={{ background: `${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium}20`, color: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium }}>
                      {item.priority || "medium"}
                    </span>
                    <span className="badge" style={{ background: `${STATUS_COLORS[item.status] || "#666"}20`, color: STATUS_COLORS[item.status] || "#666" }}>
                      {item.status === "in-progress" ? "In Progress" : item.status}
                    </span>
                  </div>
                </div>
                <div className="maintenance-card-body">
                  <div className="maintenance-meta">
                    <span className={`maintenance-type-badge ${item.type}`}>
                      <MdWarning size={14} /> {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {item.scheduledDate && (
                      <span className={`maintenance-date-badge ${relDate?.className || ""}`}>
                        <MdCalendarToday size={14} /> {new Date(item.scheduledDate).toLocaleDateString()}
                        {relDate && item.status !== "completed" && <span className="relative-date">{relDate.text}</span>}
                      </span>
                    )}
                    {item.assignedTo && <span className="maintenance-assigned"><MdAssignment size={14} /> {item.assignedTo}</span>}
                  </div>
                  {item.description && <p className="maintenance-desc">{item.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <Modal title="Maintenance Details" onClose={() => setSelectedItem(null)}>
          {selectedItem.photoURL && (
            <div className="maintenance-detail-photo">
              <img src={selectedItem.photoURL} alt={selectedItem.itemName} />
            </div>
          )}
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Item</span>
                  <span className="txn-detail-value">{selectedItem.itemName || "-"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Status</span>
                  <span className="txn-detail-value" style={{ color: STATUS_COLORS[selectedItem.status] || "#666", fontWeight: 600 }}>
                    {selectedItem.status === "in-progress" ? "In Progress" : (selectedItem.status || "-")}
                  </span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Priority</span>
                  <span className="txn-detail-value">
                    <span className="maintenance-priority-badge" style={{ background: `${PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium}20`, color: PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium }}>
                      {selectedItem.priority || "medium"}
                    </span>
                  </span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Type</span>
                  <span className="txn-detail-value">{TYPE_LABELS[selectedItem.type] || selectedItem.type || "-"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Scheduled Date</span>
                  <span className="txn-detail-value">
                    {selectedItem.scheduledDate
                      ? new Date(selectedItem.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "-"}
                  </span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Assigned To</span>
                  <span className="txn-detail-value">{selectedItem.assignedTo || "-"}</span>
                </div>
                {selectedItem.description && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Description</span>
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "60%" }}>{selectedItem.description}</span>
                  </div>
                )}
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Created</span>
                  <span className="txn-detail-value">
                    {selectedItem.createdAt
                      ? new Date(selectedItem.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "-"}
                  </span>
                </div>
                {selectedItem.updatedAt && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Last Updated</span>
                    <span className="txn-detail-value">
                      {new Date(selectedItem.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {role === "admin" && (
            <div className="maintenance-detail-actions">
              {selectedItem.status === "scheduled" && (
                <button className="btn btn-primary" onClick={() => updateStatus(selectedItem.id, "in-progress")}>
                  <MdPlayArrow size={14} /> Start
                </button>
              )}
              {selectedItem.status === "in-progress" && (
                <button className="btn btn-primary" onClick={() => updateStatus(selectedItem.id, "completed")}>
                  <MdCheckCircle size={14} /> Complete
                </button>
              )}
              <button className="btn btn-outline" onClick={() => { setSelectedItem(null); openEdit(selectedItem); }}><MdEdit size={14} /> Edit</button>
              <button className="btn btn-danger" onClick={async () => { await handleDelete(selectedItem.id); setSelectedItem(null); }}><MdDelete size={14} /> Delete</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
