import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdWarning, MdAdd, MdEdit, MdDelete, MdSearch, MdInfo, MdOutlineWarning, MdCameraAlt, MdFilterList, MdClose } from "react-icons/md";

const SEVERITY_COLORS = { low: "#43A047", medium: "#f57c00", high: "#d32f2f", critical: "#b71c1c" };
const STATUS_COLORS = { open: "#d32f2f", investigating: "#f57c00", resolved: "#43A047" };
const TYPE_LABELS = { damage: "Damage", accident: "Accident", irregularity: "Irregularity", other: "Other" };
const STATUS_TABS = ["All", "Open", "Investigating", "Resolved"];

function timeAgo(date) {
  if (!date) return "";
  let d;
  if (date?.toDate) d = date.toDate();
  else if (typeof date === "string" || typeof date === "number") d = new Date(date);
  else if (date instanceof Date) d = date;
  else return "";
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const EMPTY_FORM = { catalogId: "", title: "", description: "", type: "irregularity", severity: "medium", photos: [] };

export default function IncidentTab() {
  const { role, userProfile, user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterSeverity, setFilterSeverity] = useState("All");
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [filterMy, setFilterMy] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [imageOverlay, setImageOverlay] = useState(null);

  const canCreate = true;

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [i, c] = await Promise.all([api.getIncidents(), api.getCatalog()]);
      setIncidents(Array.isArray(i) ? i : []);
      setCatalog(Array.isArray(c) ? c : []);
    } catch {
      toast.error("Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((i) => i.status === "open").length,
    investigating: incidents.filter((i) => i.status === "investigating").length,
    resolved: incidents.filter((i) => i.status === "resolved").length,
  }), [incidents]);

  const filtered = useMemo(() => incidents.filter((inc) => {
    const matchSearch = !search ||
      inc.title?.toLowerCase().includes(search.toLowerCase()) ||
      inc.description?.toLowerCase().includes(search.toLowerCase()) ||
      inc.reporterName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || inc.status === filterStatus.toLowerCase();
    const matchSeverity = filterSeverity === "All" || inc.severity === filterSeverity.toLowerCase();
    const matchMy = !filterMy || inc.reportedBy === user?.uid;
    const incDate = inc.createdAt?.toDate ? inc.createdAt.toDate() : new Date(inc.createdAt);
    const matchFrom = !dateFrom || incDate >= new Date(dateFrom);
    const matchTo = !dateTo || incDate <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchStatus && matchSeverity && matchMy && matchFrom && matchTo;
  }), [incidents, search, filterStatus, filterSeverity, filterMy, dateFrom, dateTo, user]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(inc) {
    setForm({
      catalogId: inc.catalogId || "",
      title: inc.title || "",
      description: inc.description || "",
      type: inc.type || "irregularity",
      severity: inc.severity || "medium",
      photos: inc.photos || [],
    });
    setEditing(inc);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const item = catalog.find((c) => c.id === form.catalogId);
      if (editing) {
        await api.updateIncident(editing.id, { ...form, itemName: item ? item.itemName : "" });
        toast.success("Incident updated");
      } else {
        await api.createIncident({
          ...form,
          itemName: item ? item.itemName : "",
          reporterName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : user?.displayName || "",
          reporterRole: role,
        });
        toast.success("Incident reported");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error(editing ? "Failed to update incident" : "Failed to report incident");
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

  async function handleDelete(id) {
    if (!confirm("Delete this incident?")) return;
    try {
      await api.deleteIncident(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form.photos.length >= 3) { toast.error("Max 3 photos allowed"); return; }
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, photos: [...f.photos, url] }));
      toast.success("Photo added!");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(index) {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
  }

  async function handleResolve() {
    try {
      await api.updateIncident(selectedIncident.id, { status: "resolved", resolutionNote });
      toast.success("Incident resolved");
      setSelectedIncident(null);
      setResolutionNote("");
      load();
    } catch {
      toast.error("Failed to resolve");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdWarning size={22} /> Incident Reports</h2>
        {canCreate && (
          <button className="btn btn-primary" onClick={openAdd}><MdAdd size={16} /> Report Incident</button>
        )}
      </div>

      <div className="incident-stats">
        <div className={`incident-stat-card ${filterStatus === "All" ? "active" : ""}`} onClick={() => setFilterStatus("All")}>
          <div className="incident-stat-icon total"><MdWarning size={20} /></div>
          <div className="incident-stat-info">
            <span className="incident-stat-number">{stats.total}</span>
            <span className="incident-stat-label">Total</span>
          </div>
        </div>
        <div className={`incident-stat-card ${filterStatus === "Open" ? "active" : ""}`} onClick={() => setFilterStatus("Open")}>
          <div className="incident-stat-icon open"><MdOutlineWarning size={20} /></div>
          <div className="incident-stat-info">
            <span className="incident-stat-number">{stats.open}</span>
            <span className="incident-stat-label">Open</span>
          </div>
        </div>
        <div className={`incident-stat-card ${filterStatus === "Investigating" ? "active" : ""}`} onClick={() => setFilterStatus("Investigating")}>
          <div className="incident-stat-icon investigating"><MdInfo size={20} /></div>
          <div className="incident-stat-info">
            <span className="incident-stat-number">{stats.investigating}</span>
            <span className="incident-stat-label">Investigating</span>
          </div>
        </div>
        <div className={`incident-stat-card ${filterStatus === "Resolved" ? "active" : ""}`} onClick={() => setFilterStatus("Resolved")}>
          <div className="incident-stat-icon resolved"><MdEdit size={20} /></div>
          <div className="incident-stat-info">
            <span className="incident-stat-number">{stats.resolved}</span>
            <span className="incident-stat-label">Resolved</span>
          </div>
        </div>
      </div>

      <div className="incident-toolbar">
        <div className="incident-filter-tabs">
          {STATUS_TABS.map((s) => (
            <button key={s} className={`incident-filter-btn ${filterStatus === s ? "active" : ""}`} onClick={() => setFilterStatus(s)}>
              {s}
            </button>
          ))}
          <button className={`incident-filter-btn incident-my-btn ${filterMy ? "active" : ""}`} onClick={() => setFilterMy(!filterMy)}>
            <MdFilterList size={14} /> My Reports
          </button>
        </div>
        <div className="incident-toolbar-right">
          <div className="incident-date-range">
            <label>From</label>
            <input type="date" className="incident-date-filter" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="incident-date-range">
            <label>To</label>
            <input type="date" className="incident-date-filter" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <select className="incident-severity-filter" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="All">All Severity</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          <div className="incident-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search incidents..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Incident" : "Report Incident"}</h3>
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
              <div className="form-group">
                <label>Evidence Photos (optional, max 3)</label>
                <div className="incident-photo-upload-area">
                  {form.photos.map((url, i) => (
                    <div className="incident-photo-thumb" key={i}>
                      <img src={url} alt={`Evidence ${i + 1}`} />
                      <button type="button" className="incident-photo-remove" onClick={() => removePhoto(i)}><MdClose size={14} /></button>
                    </div>
                  ))}
                  {form.photos.length < 3 && (
                    <label className="incident-photo-add">
                      <MdCameraAlt size={18} /> {uploading ? "Uploading..." : "Add Photo"}
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden disabled={uploading} />
                    </label>
                  )}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Update" : "Submit Report"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="incident-list">
        {filtered.length === 0 ? (
          <div className="incident-empty">
            <MdWarning size={48} />
            <h3>{search || filterStatus !== "All" || filterSeverity !== "All" ? "No matching incidents" : "No incidents reported"}</h3>
            <p>{search || filterStatus !== "All" || filterSeverity !== "All" ? "Try adjusting your search or filters" : canCreate ? "Click 'Report Incident' to submit your first report" : "No incidents have been reported yet"}</p>
          </div>
        ) : filtered.map((inc) => (
          <div className={`incident-card incident-severity-${inc.severity}`} key={inc.id}
               onClick={() => setSelectedIncident(inc)} style={{ cursor: "pointer" }}>
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
                  {inc.photos?.length > 0 && <span className="incident-photo-count"><MdCameraAlt size={12} /> {inc.photos.length} photo{inc.photos.length > 1 ? "s" : ""}</span>}
                  {inc.createdAt && <span>{timeAgo(inc.createdAt)}</span>}
                </div>
                <p className="incident-desc">{inc.description?.length > 120 ? inc.description.slice(0, 120) + "..." : inc.description}</p>
              </div>
          </div>
        ))}
      </div>

      {selectedIncident && (
        <div className="modal-overlay" onClick={() => { setSelectedIncident(null); setResolutionNote(""); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedIncident.title}</h3>
            <div className="incident-detail-badges">
              <span className="badge" style={{ background: `${SEVERITY_COLORS[selectedIncident.severity]}20`, color: SEVERITY_COLORS[selectedIncident.severity] }}>
                {selectedIncident.severity}
              </span>
              <span className="badge" style={{ background: `${STATUS_COLORS[selectedIncident.status]}20`, color: STATUS_COLORS[selectedIncident.status] }}>
                {selectedIncident.status}
              </span>
            </div>
            {selectedIncident.photos?.length > 0 && (
              <div className="incident-detail-photos">
                <div className="incident-photos-grid">
                  {selectedIncident.photos.map((url, i) => (
                    <img key={i} src={url} alt={`Evidence ${i + 1}`} onClick={() => setImageOverlay(url)} style={{ cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            )}
            <div className="incident-detail-info">
              <p><strong>Type:</strong> {TYPE_LABELS[selectedIncident.type] || selectedIncident.type}</p>
              {selectedIncident.itemName && <p><strong>Related Item:</strong> {selectedIncident.itemName}</p>}
              <p><strong>Reported by:</strong> {selectedIncident.reporterName} ({selectedIncident.reporterRole})</p>
              {selectedIncident.createdAt && <p><strong>Date:</strong> {timeAgo(selectedIncident.createdAt)}</p>}
            </div>
            <div className="incident-detail-desc">
              <strong>Description:</strong>
              <p>{selectedIncident.description}</p>
            </div>
            {selectedIncident.resolutionNote && (
              <div className="incident-detail-resolution">
                <strong>Resolution Note:</strong>
                <p>{selectedIncident.resolutionNote}</p>
              </div>
            )}
            {(role === "admin" || role === "faculty") && (
              <div className="incident-detail-actions">
                {selectedIncident.status === "open" && (
                  <button className="btn btn-outline" onClick={async () => { await updateStatus(selectedIncident.id, "investigating"); setSelectedIncident(null); }}>
                    <MdInfo size={14} /> Mark Investigating
                  </button>
                )}
                {selectedIncident.status !== "resolved" && (
                  <>
                    <div className="incident-resolve-row">
                      <input type="text" className="incident-resolution-input" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Resolution note (optional)" />
                      <button className="btn btn-primary" onClick={handleResolve}><MdInfo size={14} /> Resolve</button>
                    </div>
                  </>
                )}
                {role === "admin" && (
                  <>
                    <button className="btn btn-outline" onClick={() => { setSelectedIncident(null); openEdit(selectedIncident); }}><MdEdit size={14} /> Edit</button>
                    <button className="btn btn-danger" onClick={async () => { await handleDelete(selectedIncident.id); setSelectedIncident(null); }}><MdDelete size={14} /> Delete</button>
                  </>
                )}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => { setSelectedIncident(null); setResolutionNote(""); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {imageOverlay && (
        <div className="incident-image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="incident-image-overlay-content">
            <img src={imageOverlay} alt="Full view" />
            <button className="btn-close" onClick={() => setImageOverlay(null)}>&times;</button>
          </div>
        </div>
      )}
    </div>
  );
}
