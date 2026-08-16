import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdWarning, MdAdd, MdEdit, MdInfo } from "react-icons/md";

const SEVERITY_COLORS = { low: "#2e7d32", medium: "#f57c00", high: "#d32f2f", critical: "#b71c1c" };
const STATUS_COLORS = { open: "#d32f2f", investigating: "#f57c00", resolved: "#2e7d32" };
const TYPE_LABELS = { damage: "Damage", accident: "Accident", irregularity: "Irregularity", other: "Other" };

export default function IncidentTab() {
  const { role, userProfile, user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ catalogId: "", title: "", description: "", type: "irregularity", severity: "medium" });

  const canCreate = role === "admin" || role === "faculty";

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [i, c] = await Promise.all([api.getIncidents(), api.getCatalog()]);
      setIncidents(i);
      setCatalog(c);
    } catch {
      toast.error("Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const item = catalog.find((c) => c.id === form.catalogId);
      await api.createIncident({
        ...form,
        itemName: item ? item.itemName : "",
        reporterName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : user?.displayName || "",
        reporterRole: role,
      });
      toast.success("Incident reported");
      setShowForm(false);
      setForm({ catalogId: "", title: "", description: "", type: "irregularity", severity: "medium" });
      load();
    } catch {
      toast.error("Failed to report incident");
    }
  }

  async function updateStatus(id, status) {
    try {
      await api.updateIncident(id, { status });
      toast.success("Status updated");
      load();
    } catch {
      toast.error("Failed to update");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdWarning size={22} /> Incident Reports</h2>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><MdAdd size={16} /> Report Incident</button>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Report Incident</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Brief incident title" />
              </div>
              <div className="form-group">
                <label>Related Item (optional)</label>
                <select value={form.catalogId} onChange={(e) => setForm({ ...form, catalogId: e.target.value })}>
                  <option value="">None</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.itemName}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="damage">Damage</option>
                    <option value="accident">Accident</option>
                    <option value="irregularity">Irregularity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Severity</label>
                  <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} required placeholder="Describe the incident in detail..." />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="incident-list">
        {incidents.length === 0 ? (
          <p className="empty-state">No incidents reported</p>
        ) : incidents.map((inc) => (
          <div className="incident-card" key={inc.id}>
            <div className="incident-card-header">
              <div className="incident-card-title">
                <MdWarning size={18} style={{ color: SEVERITY_COLORS[inc.severity] }} />
                <span>{inc.title}</span>
              </div>
              <div className="incident-badges">
                <span className="badge" style={{ background: `${SEVERITY_COLORS[inc.severity]}20`, color: SEVERITY_COLORS[inc.severity] }}>
                  {inc.severity}
                </span>
                <span className="badge" style={{ background: `${STATUS_COLORS[inc.status]}20`, color: STATUS_COLORS[inc.status] }}>
                  {inc.status}
                </span>
              </div>
            </div>
            <div className="incident-card-body">
              <div className="incident-meta">
                <span>Type: {TYPE_LABELS[inc.type] || inc.type}</span>
                {inc.itemName && <span>Item: {inc.itemName}</span>}
                <span>Reported by: {inc.reporterName} ({inc.reporterRole})</span>
                <span>{inc.createdAt ? new Date(inc.createdAt).toLocaleDateString() : ""}</span>
              </div>
              <p className="incident-desc">{inc.description}</p>
            </div>
            {role === "admin" && inc.status !== "resolved" && (
              <div className="incident-card-actions">
                {inc.status === "open" && (
                  <button className="btn btn-sm btn-outline" onClick={() => updateStatus(inc.id, "investigating")}>
                    <MdEdit size={14} /> Mark Investigating
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={() => updateStatus(inc.id, "resolved")}>
                  <MdInfo size={14} /> Mark Resolved
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
