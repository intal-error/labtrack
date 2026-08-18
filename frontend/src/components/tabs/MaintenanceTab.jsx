import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdBuild, MdAdd, MdEdit, MdDelete, MdCalendarToday, MdWarning, MdSearch, MdCheckCircle, MdSchedule, MdPlayArrow, MdAssignment } from "react-icons/md";

const STATUS_COLORS = {
  scheduled: "#1976d2",
  "in-progress": "#f57c00",
  completed: "#32D583",
};

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
  const [form, setForm] = useState({ catalogId: "", itemName: "", type: "preventive", description: "", status: "scheduled", scheduledDate: "", assignedTo: "" });

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
    setForm({ catalogId: "", itemName: "", type: "preventive", description: "", status: "scheduled", scheduledDate: "", assignedTo: "" });
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

  const stats = useMemo(() => {
    const total = items.length;
    const scheduled = items.filter((i) => i.status === "scheduled").length;
    const inProgress = items.filter((i) => i.status === "in-progress").length;
    const completed = items.filter((i) => i.status === "completed").length;
    return { total, scheduled, "in-progress": inProgress, completed };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") {
      result = result.filter((i) => i.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        (i.itemName || "").toLowerCase().includes(q) ||
        (i.assignedTo || "").toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q)
      );
    }
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
              <span className="maintenance-stat-number">{stats[key]}</span>
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
        <div className="maintenance-search">
          <MdSearch size={16} />
          <input type="text" placeholder="Search items, technician..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Scheduled Date</label>
                <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the maintenance task..." />
              </div>
              <div className="form-group">
                <label>Assigned To</label>
                <input type="text" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Technician name" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Update" : "Schedule"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="maintenance-list">
        {filtered.length === 0 ? (
          <div className="maintenance-empty">
            <MdBuild size={48} />
            <h3>{search || filter !== "all" ? "No matching records" : "No maintenance scheduled"}</h3>
            <p>{search || filter !== "all" ? "Try adjusting your search or filter" : "Click 'Schedule Maintenance' to create your first record"}</p>
          </div>
        ) : filtered.map((item) => {
          const relDate = getRelativeDate(item.scheduledDate);
          const dateStyle = getDateBorderStyle(item);
          return (
            <div className={`maintenance-card ${dateStyle}`} key={item.id}>
              <div className="maintenance-card-header">
                <div className="maintenance-card-title">
                  <MdBuild size={18} />
                  <span>{item.itemName}</span>
                </div>
                <div className="maintenance-card-badges">
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
              {role === "admin" && (
                <div className="maintenance-card-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => openEdit(item)}><MdEdit size={14} /> Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item.id)}><MdDelete size={14} /> Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
