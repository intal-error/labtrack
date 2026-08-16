import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdBuild, MdAdd, MdEdit, MdDelete, MdCalendarToday, MdWarning } from "react-icons/md";

const STATUS_COLORS = {
  scheduled: "#1976d2",
  "in-progress": "#f57c00",
  completed: "#2e7d32",
};

const TYPE_LABELS = { preventive: "Preventive", corrective: "Corrective" };

export default function MaintenanceTab() {
  const { role } = useAuth();
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
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

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdBuild size={22} /> Maintenance Scheduling</h2>
        {role === "admin" && (
          <button className="btn btn-primary" onClick={openCreate}><MdAdd size={16} /> Schedule Maintenance</button>
        )}
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
        {items.length === 0 ? (
          <p className="empty-state">No maintenance records yet</p>
        ) : items.map((item) => (
          <div className="maintenance-card" key={item.id}>
            <div className="maintenance-card-header">
              <div className="maintenance-card-title">
                <MdBuild size={18} />
                <span>{item.itemName}</span>
              </div>
              <span className="badge" style={{ background: `${STATUS_COLORS[item.status] || "#666"}20`, color: STATUS_COLORS[item.status] || "#666" }}>
                {item.status}
              </span>
            </div>
            <div className="maintenance-card-body">
              <div className="maintenance-meta">
                <span><MdWarning size={14} /> {TYPE_LABELS[item.type] || item.type}</span>
                {item.scheduledDate && <span><MdCalendarToday size={14} /> {new Date(item.scheduledDate).toLocaleDateString()}</span>}
                {item.assignedTo && <span>Assigned: {item.assignedTo}</span>}
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
        ))}
      </div>
    </div>
  );
}
