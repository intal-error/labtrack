import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import { filterBySearch } from "../../utils/search";
import "../../styles/pages/tabs.css";
import "../../styles/pages/catalog.css";
import "../../styles/pages/shared-form-panel.css";
import "../../styles/pages/tables.css";
import { MdBuild, MdAdd, MdEdit, MdDelete, MdCalendarToday, MdWarning, MdSearch, MdCheckCircle, MdSchedule, MdPlayArrow, MdAssignment, MdCameraAlt, MdClose, MdInfo, MdLocationOn, MdBusiness } from "react-icons/md";
import PageHero from "../ui/PageHero";
import ViewToggle from "../ui/ViewToggle";
import Pagination from "../ui/Pagination";

const STATUS_COLORS = { scheduled: "#1976d2", "in-progress": "#f57c00", completed: "#43A047" };
const STAT_ICONS = { total: <MdAssignment size={20} />, scheduled: <MdSchedule size={20} />, "in-progress": <MdPlayArrow size={20} />, completed: <MdCheckCircle size={20} /> };

function getRelativeDate(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
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
  const dateField = item.inspectedDate || item.scheduledDate;
  if (!dateField) return "";
  const rel = getRelativeDate(dateField);
  if (!rel) return "";
  if (rel.className === "date-overdue") return "card-overdue";
  if (rel.className === "date-today" || rel.className === "date-urgent") return "card-urgent";
  return "";
}

function fmtDateTime(date) {
  if (!date) return "-";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(date) {
  if (!date) return "-";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toLocalDateTime(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDate(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const EMPTY_FORM = {
  catalogId: "", itemName: "", status: "scheduled",
  inspectedDate: "", collegeBuilding: "", location: "",
  findings: "", recommendation: "", materialsNeeded: "", assignedPersonnel: "",
  estimatedDays: "", dateStarted: "", dateFinished: "",
  remarks: "", inspectedBy: "", notedBy: "",
  photoURL: "",
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
  const [page, setPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, filter]);
  useEffect(() => { load(); }, [page]);

  async function load() {
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (filter !== "all") params.status = filter;
      const [m, c] = await Promise.all([api.getMaintenance(params), api.getCatalog()]);
      if (Array.isArray(m)) { setItems(m); setPaginationData(null); }
      else if (m?.data) { setItems(m.data); setPaginationData(m.pagination || null); }
      else { setItems([]); setPaginationData(null); }
      setCatalog(Array.isArray(c) ? c : []);
    } catch { toast.error("Failed to load maintenance data"); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      catalogId: item.catalogId || "",
      itemName: item.itemName || "",
      status: item.status || "scheduled",
      inspectedDate: toLocalDateTime(item.inspectedDate || item.scheduledDate),
      collegeBuilding: item.collegeBuilding || "",
      location: item.location || "",
      findings: item.findings || item.description || "",
      recommendation: item.recommendation || "",
      materialsNeeded: item.materialsNeeded || "",
      assignedPersonnel: item.assignedPersonnel || item.assignedTo || "",
      estimatedDays: item.estimatedDays || "",
      dateStarted: toLocalDateTime(item.dateStarted),
      dateFinished: toLocalDateTime(item.dateFinished),
      remarks: item.remarks || "",
      inspectedBy: item.inspectedBy || "",
      notedBy: item.notedBy || "",
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
      const data = {
        ...form,
        inspectedDate: form.inspectedDate ? new Date(form.inspectedDate) : null,
        dateStarted: form.dateStarted ? new Date(form.dateStarted) : null,
        dateFinished: form.dateFinished ? new Date(form.dateFinished) : null,
      };
      if (editing) {
        await api.updateMaintenance(editing, data);
        toast.success("Maintenance updated");
      } else {
        await api.createMaintenance(data);
        toast.success("Maintenance scheduled");
      }
      setShowForm(false);
      load();
    } catch { toast.error("Failed to save maintenance"); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this maintenance record?")) return;
    try { await api.deleteMaintenance(id); toast.success("Deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const { url } = await api.uploadImage(file); setForm((f) => ({ ...f, photoURL: url })); toast.success("Photo uploaded!"); }
    catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  }

  async function updateStatus(id, status) {
    try { await api.updateMaintenance(id, { status }); toast.success("Status updated"); setSelectedItem(null); load(); }
    catch { toast.error("Failed to update"); }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const scheduled = items.filter((i) => i.status === "scheduled").length;
    const inProgress = items.filter((i) => i.status === "in-progress").length;
    const completed = items.filter((i) => i.status === "completed").length;
    const overdue = items.filter((i) => {
      if (i.status === "completed") return false;
      const dateField = i.inspectedDate || i.scheduledDate;
      if (!dateField) return false;
      const rel = getRelativeDate(dateField);
      return rel?.className === "date-overdue";
    }).length;
    return { total, scheduled, "in-progress": inProgress, completed, overdue };
  }, [items]);

  const filtered = useMemo(() => {
    let result = [...items];
    if (filter !== "all") result = result.filter((i) => i.status === filter);
    if (search.trim()) result = filterBySearch(result, search, ["itemName", "collegeBuilding", "location", "findings", "inspectedBy", "notedBy", "assignedPersonnel", "assignedTo"]);
    result.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      const aDate = (a.inspectedDate || a.scheduledDate) ? new Date(a.inspectedDate || a.scheduledDate).getTime() : Infinity;
      const bDate = (b.inspectedDate || b.scheduledDate) ? new Date(b.inspectedDate || b.scheduledDate).getTime() : Infinity;
      return aDate - bDate;
    });
    return result;
  }, [items, filter, search]);

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <PageHero icon={MdBuild} title="Maintenance">
        {role === "admin" && (
          <button className="hero-action-btn ghost" onClick={openCreate}><MdAdd size={16} /> New MAF</button>
        )}
      </PageHero>

      <div className="maintenance-stats">
        {["total", "scheduled", "in-progress", "completed"].map((key) => (
          <div className={`maintenance-stat-card ${filter === key ? "active" : ""}`} key={key} onClick={() => setFilter(filter === key ? "all" : key)}>
            <div className={`maintenance-stat-icon ${key}`}>{STAT_ICONS[key]}</div>
            <div className="maintenance-stat-info">
              <span className="maintenance-stat-number">
                {stats[key]}
                {key === "total" && stats.overdue > 0 && <span className="maintenance-overdue-badge">{stats.overdue} overdue</span>}
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
            <input type="text" placeholder="Search items, location, inspector..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-maintenance-view" />
        </div>
      </div>

      <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{editing ? "Edit MAF" : "New MAF"}</h2>
          <button className="lab-slide-close" onClick={() => setShowForm(false)}><MdClose size={20} /></button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleSubmit}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Inspection Info</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Date & Time Inspected</label>
                  <div className="lab-input-wrap">
                    <input type="datetime-local" value={form.inspectedDate} onChange={(e) => setForm({ ...form, inspectedDate: e.target.value })} />
                    <MdCalendarToday size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>College/Building Name</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.collegeBuilding} onChange={(e) => setForm({ ...form, collegeBuilding: e.target.value })} placeholder="e.g. College of Engineering" />
                    <MdBusiness size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Serial #/Equipment Concern</label>
                  <div className="lab-input-wrap">
                    <select value={form.catalogId} onChange={(e) => handleItemChange(e.target.value)} required>
                      <option value="">Select equipment</option>
                      {catalog.map((c) => <option key={c.id} value={c.id}>{c.itemName}</option>)}
                    </select>
                    <MdAssignment size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Location</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Room 301, Lab A" />
                    <MdLocationOn size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">I. Findings & Observation</span>
              </div>
              <div className="lab-form-field">
                <textarea value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} rows={3} placeholder="Describe inspector's findings and observations..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">II. Recommendation</span>
              </div>
              <div className="lab-form-field">
                <textarea value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} rows={3} placeholder="Recommendations for maintenance..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">III. Materials Needed</span>
              </div>
              <div className="lab-form-field">
                <textarea value={form.materialsNeeded} onChange={(e) => setForm({ ...form, materialsNeeded: e.target.value })} rows={2} placeholder="List materials needed (if any)..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">IV. Personnel or Manpower Assigned</span>
              </div>
              <div className="lab-form-field">
                <textarea value={form.assignedPersonnel} onChange={(e) => setForm({ ...form, assignedPersonnel: e.target.value })} rows={2} placeholder="Names of personnel assigned..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdSchedule size={14} /></div>
                <span className="lab-form-section-title">V. Work Schedule</span>
              </div>
              <div className="lab-form-field">
                <label>No. of Days or Hours to Complete</label>
                <div className="lab-input-wrap">
                  <input type="text" value={form.estimatedDays} onChange={(e) => setForm({ ...form, estimatedDays: e.target.value })} placeholder="e.g. 3 days, 5 hours" />
                  <MdInfo size={16} />
                </div>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Date & Time Started</label>
                  <div className="lab-input-wrap">
                    <input type="datetime-local" value={form.dateStarted} onChange={(e) => setForm({ ...form, dateStarted: e.target.value })} />
                    <MdCalendarToday size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Date & Time Finished</label>
                  <div className="lab-input-wrap">
                    <input type="datetime-local" value={form.dateFinished} onChange={(e) => setForm({ ...form, dateFinished: e.target.value })} />
                    <MdCalendarToday size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Remarks</span>
              </div>
              <div className="lab-form-field">
                <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} placeholder="Additional remarks..." />
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdAssignment size={14} /></div>
                <span className="lab-form-section-title">Signatures</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Inspected By</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.inspectedBy} onChange={(e) => setForm({ ...form, inspectedBy: e.target.value })} placeholder="Name" />
                    <MdAssignment size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Noted By</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.notedBy} onChange={(e) => setForm({ ...form, notedBy: e.target.value })} placeholder="Name" />
                    <MdAssignment size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Status & Photo</span>
              </div>
              <div className="lab-form-field">
                <label>Status</label>
                <div className="lab-input-wrap">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  <MdInfo size={16} />
                </div>
              </div>
              <div className="lab-form-field">
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
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn">{editing ? "Update" : "Schedule"}</button>
            </div>
          </form>
        </div>
      </div>
      {showForm && <div className="lab-slide-backdrop" onClick={() => setShowForm(false)} />}

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
          <p>{search || filter !== "all" ? "Try adjusting your search or filter" : "Click 'New MAF' to create your first record"}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="catalog-grid">
          {filtered.map((item) => {
            const dateField = item.inspectedDate || item.scheduledDate;
            const relDate = getRelativeDate(dateField);
            return (
              <div className="catalog-card" key={item.id} onClick={() => setSelectedItem(item)}>
                {item.photoURL && (
                  <div className="catalog-card-image">
                    <img src={item.photoURL} alt={item.itemName} loading="lazy" />
                  </div>
                )}
                <div className="catalog-card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <h4 className="catalog-card-title" style={{ margin: 0 }}>{item.itemName}</h4>
                    <span className="badge" style={{ background: `${STATUS_COLORS[item.status] || "#666"}20`, color: STATUS_COLORS[item.status] || "#666", flexShrink: 0 }}>
                      {item.status === "in-progress" ? "In Progress" : item.status}
                    </span>
                  </div>
                  {item.collegeBuilding && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0" }}><MdBusiness size={12} style={{ verticalAlign: -2 }} /> {item.collegeBuilding}</p>}
                  {item.location && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0" }}><MdLocationOn size={12} style={{ verticalAlign: -2 }} /> {item.location}</p>}
                  {relDate && item.status !== "completed" && (
                    <span className={`maintenance-date-badge ${relDate.className}`} style={{ marginBottom: 6, display: "inline-block" }}>{relDate.text}</span>
                  )}
                  {item.inspectedBy && <p className="catalog-card-desc" style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Inspected by: {item.inspectedBy}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="maintenance-list">
          {filtered.map((item) => {
            const dateField = item.inspectedDate || item.scheduledDate;
            const relDate = getRelativeDate(dateField);
            const dateStyle = getDateBorderStyle(item);
            return (
              <div className={`maintenance-card ${dateStyle}`} key={item.id} onClick={() => setSelectedItem(item)}>
                {item.photoURL && (
                  <div className="maintenance-card-photo">
                    <img src={item.photoURL} alt={item.itemName} loading="lazy" />
                  </div>
                )}
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
                    {item.collegeBuilding && <span className="maintenance-assigned"><MdBusiness size={14} /> {item.collegeBuilding}</span>}
                    {item.location && <span className="maintenance-assigned"><MdLocationOn size={14} /> {item.location}</span>}
                    {dateField && (
                      <span className={`maintenance-date-badge ${relDate?.className || ""}`}>
                        <MdCalendarToday size={14} /> {fmtDate(dateField)}
                        {relDate && item.status !== "completed" && <span className="relative-date">{relDate.text}</span>}
                      </span>
                    )}
                    {item.inspectedBy && <span className="maintenance-assigned"><MdAssignment size={14} /> {item.inspectedBy}</span>}
                  </div>
                  {item.findings && <p className="maintenance-desc">{item.findings.length > 120 ? item.findings.slice(0, 120) + "..." : item.findings}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <Modal title="Maintenance Action Form" onClose={() => setSelectedItem(null)}>
          {selectedItem.photoURL && (
            <div className="maintenance-detail-photo">
              <img src={selectedItem.photoURL} alt={selectedItem.itemName} />
            </div>
          )}
          <div className="txn-detail-modal">
            <div className="txn-detail-section">
              <h5>Inspection Info</h5>
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Equipment</span>
                  <span className="txn-detail-value">{selectedItem.itemName || "-"}</span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Status</span>
                  <span className="txn-detail-value" style={{ color: STATUS_COLORS[selectedItem.status] || "#666", fontWeight: 600 }}>
                    {selectedItem.status === "in-progress" ? "In Progress" : (selectedItem.status || "-")}
                  </span>
                </div>
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Date/Time Inspected</span>
                  <span className="txn-detail-value">{fmtDateTime(selectedItem.inspectedDate || selectedItem.scheduledDate)}</span>
                </div>
                {selectedItem.collegeBuilding && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">College/Building</span>
                    <span className="txn-detail-value">{selectedItem.collegeBuilding}</span>
                  </div>
                )}
                {selectedItem.location && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Location</span>
                    <span className="txn-detail-value">{selectedItem.location}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedItem.findings && (
              <div className="txn-detail-section">
                <h5>I. Findings & Observation</h5>
                <div className="txn-detail-grid">
                  <div className="txn-detail-row">
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{selectedItem.findings}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedItem.recommendation && (
              <div className="txn-detail-section">
                <h5>II. Recommendation</h5>
                <div className="txn-detail-grid">
                  <div className="txn-detail-row">
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{selectedItem.recommendation}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedItem.materialsNeeded && (
              <div className="txn-detail-section">
                <h5>III. Materials Needed</h5>
                <div className="txn-detail-grid">
                  <div className="txn-detail-row">
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{selectedItem.materialsNeeded}</span>
                  </div>
                </div>
              </div>
            )}

            {(selectedItem.assignedPersonnel || selectedItem.assignedTo) && (
              <div className="txn-detail-section">
                <h5>IV. Personnel Assigned</h5>
                <div className="txn-detail-grid">
                  <div className="txn-detail-row">
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{selectedItem.assignedPersonnel || selectedItem.assignedTo}</span>
                  </div>
                </div>
              </div>
            )}

            {(selectedItem.estimatedDays || selectedItem.dateStarted || selectedItem.dateFinished) && (
              <div className="txn-detail-section">
                <h5>V. Work Schedule</h5>
                <div className="txn-detail-grid">
                  {selectedItem.estimatedDays && (
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Est. Time to Complete</span>
                      <span className="txn-detail-value">{selectedItem.estimatedDays}</span>
                    </div>
                  )}
                  {selectedItem.dateStarted && (
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Date/Time Started</span>
                      <span className="txn-detail-value">{fmtDateTime(selectedItem.dateStarted)}</span>
                    </div>
                  )}
                  {selectedItem.dateFinished && (
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Date/Time Finished</span>
                      <span className="txn-detail-value">{fmtDateTime(selectedItem.dateFinished)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedItem.remarks && (
              <div className="txn-detail-section">
                <h5>Remarks</h5>
                <div className="txn-detail-grid">
                  <div className="txn-detail-row">
                    <span className="txn-detail-value" style={{ textAlign: "left", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{selectedItem.remarks}</span>
                  </div>
                </div>
              </div>
            )}

            {(selectedItem.inspectedBy || selectedItem.notedBy) && (
              <div className="txn-detail-section">
                <h5>Signatures</h5>
                <div className="txn-detail-grid">
                  {selectedItem.inspectedBy && (
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Inspected By</span>
                      <span className="txn-detail-value">{selectedItem.inspectedBy}</span>
                    </div>
                  )}
                  {selectedItem.notedBy && (
                    <div className="txn-detail-row">
                      <span className="txn-detail-label">Noted By</span>
                      <span className="txn-detail-value">{selectedItem.notedBy}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="txn-detail-section">
              <div className="txn-detail-grid">
                <div className="txn-detail-row">
                  <span className="txn-detail-label">Created</span>
                  <span className="txn-detail-value">{fmtDate(selectedItem.createdAt)}</span>
                </div>
                {selectedItem.updatedAt && (
                  <div className="txn-detail-row">
                    <span className="txn-detail-label">Last Updated</span>
                    <span className="txn-detail-value">{fmtDate(selectedItem.updatedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {role === "admin" && (
            <div className="maintenance-detail-actions">
              {selectedItem.status === "scheduled" && (
                <button className="btn btn-primary" onClick={() => updateStatus(selectedItem.id, "in-progress")}><MdPlayArrow size={14} /> Start</button>
              )}
              {selectedItem.status === "in-progress" && (
                <button className="btn btn-primary" onClick={() => updateStatus(selectedItem.id, "completed")}><MdCheckCircle size={14} /> Complete</button>
              )}
              <button className="btn btn-outline" onClick={() => { setSelectedItem(null); openEdit(selectedItem); }}><MdEdit size={14} /> Edit</button>
              <button className="btn btn-danger" onClick={async () => { await handleDelete(selectedItem.id); setSelectedItem(null); }}><MdDelete size={14} /> Delete</button>
            </div>
          )}
        </Modal>
      )}

      {paginationData && paginationData.totalPages > 1 && (
        <Pagination currentPage={page} totalPages={paginationData.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
