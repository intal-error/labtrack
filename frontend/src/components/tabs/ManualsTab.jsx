import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { filterBySearch } from "../../utils/search";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdMenuBook, MdAdd, MdDelete, MdEdit, MdSearch, MdOpenInNew, MdDownload, MdCloudUpload, MdClose, MdInfo, MdAssignment, MdDescription } from "react-icons/md";
import PageHero from "../ui/PageHero";

const CATEGORIES = ["All", "General", "Safety", "Equipment Guide", "Software", "Procedure"];
const CATEGORY_ICONS = { General: "📘", Safety: "🛡️", "Equipment Guide": "🔧", Software: "💻", Procedure: "📋" };

const FILE_TYPE_ICONS = {
  pdf: { color: "#d32f2f", label: "PDF" },
  doc: { color: "#1976d2", label: "DOC" },
  docx: { color: "#1976d2", label: "DOC" },
  xls: { color: "#2E7D32", label: "XLS" },
  xlsx: { color: "#2E7D32", label: "XLS" },
  ppt: { color: "#ef6c00", label: "PPT" },
  pptx: { color: "#ef6c00", label: "PPT" },
  jpg: { color: "#7b1fa2", label: "IMG" },
  jpeg: { color: "#7b1fa2", label: "IMG" },
  png: { color: "#7b1fa2", label: "IMG" },
  video: { color: "#c62828", label: "VID" },
  mp4: { color: "#c62828", label: "VID" },
};

function getFileType(fileName) {
  if (!fileName) return null;
  const ext = fileName.split(".").pop().toLowerCase();
  return FILE_TYPE_ICONS[ext] || null;
}

function timeAgo(date) {
  if (!date) return "";
  if (typeof date?.toDate === "function") return timeAgo(date.toDate());
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
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

const EMPTY_FORM = { title: "", description: "", category: "General", fileUrl: "", fileName: "" };

export default function ManualsTab() {
  const { role, userProfile } = useAuth();
  const [manuals, setManuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getManuals();
      setManuals(data || []);
    } catch {
      toast.error("Failed to load manuals");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => ({
    total: manuals.length,
    general: manuals.filter((m) => m.category === "General").length,
    safety: manuals.filter((m) => m.category === "Safety").length,
    equipment: manuals.filter((m) => m.category === "Equipment Guide").length,
    software: manuals.filter((m) => m.category === "Software").length,
    procedure: manuals.filter((m) => m.category === "Procedure").length,
  }), [manuals]);

  const filtered = useMemo(() => manuals.filter((m) => {
    const matchSearch = !search ||
      filterBySearch([m], search, ["title", "description", "fileName"]).length > 0;
    const matchCategory = filterCategory === "All" || m.category === filterCategory;
    return matchSearch && matchCategory;
  }), [manuals, search, filterCategory]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(m) {
    setForm({ title: m.title || "", description: m.description || "", category: m.category || "General", fileUrl: m.fileUrl || "", fileName: m.fileName || "" });
    setEditing(m);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateManual(editing.id, form);
        toast.success("Manual updated");
      } else {
        await api.createManual(form);
        toast.success("Manual uploaded");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error(editing ? "Failed to update manual" : "Failed to upload manual");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadDocument(file);
      setForm((f) => ({ ...f, fileUrl: url, fileName: file.name }));
      toast.success("File uploaded!");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this manual?")) return;
    try {
      await api.deleteManual(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <PageHero icon={MdMenuBook} title="Lab Manuals" subtitle="Guides and references for laboratory equipment">
        {role === "admin" && (
          <button className="hero-action-btn ghost" onClick={openAdd}><MdAdd size={16} /> Upload Manual</button>
        )}
      </PageHero>

      <div className="manuals-stats">
        <div className={`manuals-stat-card ${filterCategory === "All" ? "active" : ""}`} onClick={() => setFilterCategory("All")}>
          <div className="manuals-stat-icon total"><MdMenuBook size={20} /></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.total}</span>
            <span className="manuals-stat-label">Total Manuals</span>
          </div>
        </div>
        <div className={`manuals-stat-card ${filterCategory === "General" ? "active" : ""}`} onClick={() => setFilterCategory("General")}>
          <div className="manuals-stat-icon general"><span>📘</span></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.general}</span>
            <span className="manuals-stat-label">General</span>
          </div>
        </div>
        <div className={`manuals-stat-card ${filterCategory === "Safety" ? "active" : ""}`} onClick={() => setFilterCategory("Safety")}>
          <div className="manuals-stat-icon safety"><span>🛡️</span></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.safety}</span>
            <span className="manuals-stat-label">Safety</span>
          </div>
        </div>
        <div className={`manuals-stat-card ${filterCategory === "Equipment Guide" ? "active" : ""}`} onClick={() => setFilterCategory("Equipment Guide")}>
          <div className="manuals-stat-icon equipment"><span>🔧</span></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.equipment}</span>
            <span className="manuals-stat-label">Equipment</span>
          </div>
        </div>
      </div>

      <div className="manuals-toolbar">
        <div className="manuals-filter-tabs">
          {CATEGORIES.map((c) => (
            <button key={c} className={`manuals-filter-btn ${filterCategory === c ? "active" : ""}`} onClick={() => setFilterCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="manuals-search">
          <MdSearch size={16} />
          <input type="text" placeholder="Search manuals..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{editing ? "Edit Manual" : "Upload Manual"}</h2>
          <button className="lab-slide-close" onClick={() => { setShowForm(false); setEditing(null); }}>
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleSubmit}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdMenuBook size={14} /></div>
                <span className="lab-form-section-title">Document Info</span>
              </div>
              <div className="lab-form-field">
                <label>Title <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Manual title" />
                  <MdEdit size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Category</label>
                <div className="lab-input-wrap">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="General">General</option>
                    <option value="Safety">Safety</option>
                    <option value="Equipment Guide">Equipment Guide</option>
                    <option value="Software">Software</option>
                    <option value="Procedure">Procedure</option>
                  </select>
                  <MdAssignment size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-evidence"><MdCloudUpload size={14} /></div>
                <span className="lab-form-section-title">File</span>
              </div>
              <div className="lab-form-field">
                <label>Upload <span className="lab-required" /></label>
                {form.fileUrl ? (
                  <div className="manual-file-preview">
                    <span className="manual-file-name">{form.fileName || "Uploaded file"}</span>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setForm((f) => ({ ...f, fileUrl: "", fileName: "" }))}>Remove</button>
                  </div>
                ) : (
                  <label className="manual-upload-btn">
                    <MdCloudUpload size={18} /> {uploading ? "Uploading..." : "Choose file or paste URL"}
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4" onChange={handleFileUpload} hidden disabled={uploading} />
                  </label>
                )}
              </div>
              {!form.fileUrl && (
                <div className="lab-form-field">
                  <label>Or paste File URL</label>
                  <div className="lab-input-wrap">
                    <input type="url" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://drive.google.com/..." />
                    <MdInfo size={16} />
                  </div>
                </div>
              )}
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description"><MdDescription size={14} /></div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className="lab-form-field">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Brief description..." />
              </div>
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn" disabled={!form.fileUrl}>{editing ? "Update" : "Upload"}</button>
            </div>
          </form>
        </div>
      </div>
      {showForm && <div className="lab-slide-backdrop" onClick={() => { setShowForm(false); setEditing(null); }} />}

      <div className="manuals-grid">
        {filtered.length === 0 ? (
          <div className="manuals-empty">
            <MdMenuBook size={48} />
            <h3>{search || filterCategory !== "All" ? "No matching manuals" : "No manuals yet"}</h3>
            <p>{search || filterCategory !== "All" ? "Try adjusting your search or filter" : role === "admin" ? "Click 'Upload Manual' to add your first manual" : "No manuals have been uploaded yet"}</p>
          </div>
        ) : filtered.map((m) => {
          const fileType = getFileType(m.fileName);
          return (
            <div className="manual-card" key={m.id}>
              <div className="manual-card-icon">
                {fileType ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <MdMenuBook size={28} style={{ color: fileType.color }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: fileType.color, background: `${fileType.color}15`, padding: "1px 6px", borderRadius: 4 }}>{fileType.label}</span>
                  </div>
                ) : (
                  <MdMenuBook size={32} />
                )}
              </div>
              <div className="manual-card-body">
                <h4>{m.title}</h4>
                <span className="manual-card-category">{m.category}</span>
                {m.description && <p className="manual-card-desc">{m.description}</p>}
                {m.fileName && <span className="manual-filename">{m.fileName}</span>}
                <div className="manual-card-meta">
                  {m.createdAt && <span className="manual-meta-date">{timeAgo(m.updatedAt || m.createdAt)}</span>}
                  {m.uploaderName && <span className="manual-meta-uploader">by {m.uploaderName}</span>}
                </div>
              </div>
              <div className="manual-card-actions">
                {m.fileUrl && (
                  <>
                    <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary" onClick={(e) => e.stopPropagation()}>
                      <MdOpenInNew size={14} /> Open
                    </a>
                    <a href={m.fileUrl} download className="btn btn-sm btn-outline" onClick={(e) => e.stopPropagation()}>
                      <MdDownload size={14} />
                    </a>
                  </>
                )}
                {role === "admin" && (
                  <>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(m)}><MdEdit size={14} /></button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}><MdDelete size={14} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
