import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { filterBySearch } from "../../utils/search";
import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import { MdWarning, MdAdd, MdEdit, MdDelete, MdSearch, MdInfo, MdOutlineWarning, MdCameraAlt, MdFilterList, MdClose, MdEvent, MdPerson, MdAssignment, MdSchedule, MdLocationOn } from "react-icons/md";
import PageHero from "../ui/PageHero";

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
  const [showDetail, setShowDetail] = useState(false);

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
    critical: incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length,
    high: incidents.filter((i) => i.severity === "high" && i.status !== "resolved").length,
    newToday: incidents.filter((i) => {
      const d = i.createdAt?.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
      const today = new Date(); today.setHours(0,0,0,0);
      return d >= today;
    }).length,
  }), [incidents]);

  const statusCounts = useMemo(() => {
    const counts = { All: incidents.length, Open: 0, Investigating: 0, Resolved: 0 };
    incidents.forEach((i) => {
      if (i.status === "open") counts.Open++;
      else if (i.status === "investigating") counts.Investigating++;
      else if (i.status === "resolved") counts.Resolved++;
    });
    return counts;
  }, [incidents]);

  const filtered = useMemo(() => incidents.filter((inc) => {
    const matchSearch = !search ||
      filterBySearch([inc], search, ["title", "description", "reporterName"]).length > 0;
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
      <PageHero icon={MdWarning} title="Incident Reports" subtitle="Report and track laboratory incidents">
        {canCreate && (
          <button className="hero-action-btn ghost" onClick={openAdd}><MdAdd size={16} /> Report Incident</button>
        )}
      </PageHero>

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
            {stats.critical > 0 && <span className="incident-severity-mini" style={{ color: SEVERITY_COLORS.critical }}>{stats.critical} critical</span>}
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
              {s} {statusCounts[s] > 0 && <span className="filter-count">{statusCounts[s]}</span>}
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

      <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{editing ? "Edit Incident" : "Report Incident"}</h2>
          <button className="lab-slide-close" onClick={() => { setShowForm(false); setEditing(null); }}>
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleSubmit}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdWarning size={14} /></div>
                <span className="lab-form-section-title">Incident Info</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Title <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Brief incident title" />
                    <MdEdit size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Related Item (optional)</label>
                <div className="lab-input-wrap">
                  <select value={form.catalogId} onChange={(e) => setForm({ ...form, catalogId: e.target.value })}>
                    <option value="">None</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.itemName}</option>)}
                  </select>
                  <MdAssignment size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdFilterList size={14} /></div>
                <span className="lab-form-section-title">Classification</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Type <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      <option value="damage">Damage</option>
                      <option value="accident">Accident</option>
                      <option value="irregularity">Irregularity</option>
                      <option value="other">Other</option>
                    </select>
                    <MdWarning size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Severity <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                    <MdOutlineWarning size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className="lab-form-field">
                <label>Description <span className="lab-required" /></label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} required placeholder="Describe the incident in detail..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-evidence"><MdCameraAlt size={14} /></div>
                <span className="lab-form-section-title">Evidence</span>
              </div>
              <div className="lab-form-field">
                <label>Photos (optional, max 3)</label>
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
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn">{editing ? "Update" : "Submit Report"}</button>
            </div>
          </form>
        </div>
      </div>
      {showForm && <div className="lab-slide-backdrop" onClick={() => { setShowForm(false); setEditing(null); }} />}

      <div className="incident-list">
        {filtered.length === 0 ? (
            <div className="incident-empty">
              <div className="incident-empty-icon"><MdWarning size={56} /></div>
              <h3>{search || filterStatus !== "All" || filterSeverity !== "All" ? "No matching incidents" : "No incidents reported"}</h3>
              <p>{search || filterStatus !== "All" || filterSeverity !== "All" ? "Try adjusting your search or filters" : canCreate ? "Click 'Report Incident' to submit your first report" : "No incidents have been reported yet"}</p>
            </div>
          ) : (
            <div className="incident-list-grid">
            {filtered.map((inc) => (
          <div className={`incident-card incident-severity-${inc.severity}`} key={inc.id}
               onClick={() => { setSelectedIncident(inc); setShowDetail(true); }} style={{ cursor: "pointer" }}>
            <div className="incident-card-header">
              <div className="incident-card-title">
                <span className="incident-severity-dot" style={{ background: SEVERITY_COLORS[inc.severity] }} />
                <span className="incident-card-title-text">{inc.title}</span>
              </div>
              <div className="incident-badges">
                <span className="badge" style={{ background: `${SEVERITY_COLORS[inc.severity]}15`, color: SEVERITY_COLORS[inc.severity], border: `1px solid ${SEVERITY_COLORS[inc.severity]}30` }}>
                  {inc.severity}
                </span>
                <span className="badge" style={{ background: `${STATUS_COLORS[inc.status]}15`, color: STATUS_COLORS[inc.status], border: `1px solid ${STATUS_COLORS[inc.status]}30` }}>
                  {inc.status}
                </span>
              </div>
            </div>
            <div className="incident-card-body">
              <div className="incident-meta">
                <span className="incident-meta-item"><MdInfo size={12} /> {TYPE_LABELS[inc.type] || inc.type}</span>
                {inc.itemName && <span className="incident-meta-item"><MdAssignment size={12} /> {inc.itemName}</span>}
                <span className="incident-meta-item"><MdPerson size={12} /> {inc.reporterName}</span>
                {inc.photos?.length > 0 && <span className="incident-meta-item incident-photo-badge"><MdCameraAlt size={12} /> {inc.photos.length}</span>}
                {inc.createdAt && <span className="incident-meta-item incident-time"><MdSchedule size={12} /> {timeAgo(inc.createdAt)}</span>}
              </div>
              <p className="incident-desc">{inc.description?.length > 150 ? inc.description.slice(0, 150) + "..." : inc.description}</p>
            </div>
          </div>
        ))}
        </div>
          )}
      </div>

      {selectedIncident && (
        <div className={`lab-slide-panel ${showDetail ? "open" : ""}`}>
          <div className="lab-slide-header">
            <h2>{selectedIncident.title}</h2>
            <button className="lab-slide-close" onClick={() => { setSelectedIncident(null); setShowDetail(false); setResolutionNote(""); }}>
              <MdClose size={20} />
            </button>
          </div>
          <div className="lab-slide-body">
            <div className="lab-slide-accent" />
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdWarning size={14} /></div>
                <span className="lab-form-section-title">Status</span>
              </div>
              <div className="incident-detail-badges">
                <span className="badge" style={{ background: `${SEVERITY_COLORS[selectedIncident.severity]}20`, color: SEVERITY_COLORS[selectedIncident.severity] }}>
                  {selectedIncident.severity}
                </span>
                <span className="badge" style={{ background: `${STATUS_COLORS[selectedIncident.status]}20`, color: STATUS_COLORS[selectedIncident.status] }}>
                  {selectedIncident.status}
                </span>
              </div>
            </div>

            {selectedIncident.photos?.length > 0 && (
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-evidence"><MdCameraAlt size={14} /></div>
                  <span className="lab-form-section-title">Evidence</span>
                </div>
                <div className="incident-detail-photos">
                  <div className="incident-photos-grid">
                    {selectedIncident.photos.map((url, i) => (
                      <img key={i} src={url} alt={`Evidence ${i + 1}`} loading="lazy" onClick={() => setImageOverlay(url)} style={{ cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Information</span>
              </div>
              <div className="incident-detail-info">
                <div className="incident-info-row"><span className="incident-info-label">Type</span><span className="incident-info-value">{TYPE_LABELS[selectedIncident.type] || selectedIncident.type}</span></div>
                {selectedIncident.itemName && <div className="incident-info-row"><span className="incident-info-label">Related Item</span><span className="incident-info-value">{selectedIncident.itemName}</span></div>}
                <div className="incident-info-row"><span className="incident-info-label">Reported by</span><span className="incident-info-value">{selectedIncident.reporterName} ({selectedIncident.reporterRole})</span></div>
                {selectedIncident.createdAt && <div className="incident-info-row"><span className="incident-info-label">Date</span><span className="incident-info-value">{timeAgo(selectedIncident.createdAt)}</span></div>}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description"><MdEdit size={14} /></div>
                <span className="lab-form-section-title">Description</span>
              </div>
              <div className="incident-detail-desc">
                <p>{selectedIncident.description}</p>
              </div>
            </div>

            {selectedIncident.resolutionNote && (
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-resolved"><MdInfo size={14} /></div>
                  <span className="lab-form-section-title">Resolution Note</span>
                </div>
                <div className="incident-detail-resolution">
                  <p>{selectedIncident.resolutionNote}</p>
                </div>
              </div>
            )}

            {role === "admin" && (
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-actions"><MdFilterList size={14} /></div>
                  <span className="lab-form-section-title">Actions</span>
                </div>
                <div className="incident-detail-actions">
                  {selectedIncident.status === "open" && (
                    <button className="btn btn-outline incident-action-btn" onClick={async () => { await updateStatus(selectedIncident.id, "investigating"); setSelectedIncident(null); setShowDetail(false); }}>
                      <MdInfo size={14} /> Mark Investigating
                    </button>
                  )}
                  {selectedIncident.status !== "resolved" && (
                    <div className="incident-resolve-section">
                      <label className="incident-resolve-label">Resolution Note</label>
                      <textarea className="incident-resolution-textarea" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Describe how the incident was resolved..." rows={3} />
                      <button className="btn btn-primary incident-action-btn" onClick={handleResolve}><MdInfo size={14} /> Mark as Resolved</button>
                    </div>
                  )}
                  <div className="incident-detail-actions-row">
                    <button className="btn btn-outline incident-action-btn" onClick={() => { setSelectedIncident(null); setShowDetail(false); openEdit(selectedIncident); }}><MdEdit size={14} /> Edit</button>
                    <button className="btn btn-danger incident-action-btn" onClick={async () => { await handleDelete(selectedIncident.id); setSelectedIncident(null); setShowDetail(false); }}><MdDelete size={14} /> Delete</button>
                  </div>
                </div>
              </div>
            )}

            <div className="lab-form-actions">
              <button className="lab-form-cancel-btn" onClick={() => { setSelectedIncident(null); setShowDetail(false); setResolutionNote(""); }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {selectedIncident && <div className="lab-slide-backdrop" onClick={() => { setSelectedIncident(null); setShowDetail(false); setResolutionNote(""); }} />}

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
