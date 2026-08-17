import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdMenuBook, MdAdd, MdDelete, MdEdit, MdSearch, MdOpenInNew } from "react-icons/md";

const CATEGORIES = ["All", "General", "Safety", "Equipment Guide", "Software", "Procedure"];
const CATEGORY_ICONS = { General: "📘", Safety: "🛡️", "Equipment Guide": "🔧", Software: "💻", Procedure: "📋" };

function timeAgo(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
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

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getManuals();
      setManuals(data);
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
      m.title?.toLowerCase().includes(search.toLowerCase()) ||
      m.description?.toLowerCase().includes(search.toLowerCase());
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
      <div className="records-header">
        <h2><MdMenuBook size={22} /> Laboratory Manual Repository</h2>
        {role === "admin" && (
          <button className="btn btn-primary" onClick={openAdd}><MdAdd size={16} /> Upload Manual</button>
        )}
      </div>

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

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Manual" : "Upload Manual"}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Manual title" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="General">General</option>
                  <option value="Safety">Safety</option>
                  <option value="Equipment Guide">Equipment Guide</option>
                  <option value="Software">Software</option>
                  <option value="Procedure">Procedure</option>
                </select>
              </div>
              <div className="form-group">
                <label>File URL</label>
                <input type="url" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} required placeholder="https://drive.google.com/..." />
              </div>
              <div className="form-group">
                <label>File Name</label>
                <input type="text" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="e.g. Lab Safety Guide.pdf" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Brief description..." />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Update" : "Upload"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="manuals-grid">
        {filtered.length === 0 ? (
          <div className="manuals-empty">
            <MdMenuBook size={48} />
            <h3>{search || filterCategory !== "All" ? "No matching manuals" : "No manuals yet"}</h3>
            <p>{search || filterCategory !== "All" ? "Try adjusting your search or filter" : role === "admin" ? "Click 'Upload Manual' to add your first manual" : "No manuals have been uploaded yet"}</p>
          </div>
        ) : filtered.map((m) => (
          <div className="manual-card" key={m.id}>
            <div className="manual-card-icon">
              <MdMenuBook size={32} />
            </div>
            <div className="manual-card-body">
              <h4>{m.title}</h4>
              <span className="manual-card-category">{m.category}</span>
              {m.description && <p className="manual-card-desc">{m.description}</p>}
              {m.fileName && <span className="manual-filename">{m.fileName}</span>}
              <div className="manual-card-meta">
                {m.createdAt && <span className="manual-meta-date">{timeAgo(m.createdAt)}</span>}
                {m.uploadedBy && <span className="manual-meta-uploader">by {m.uploadedBy}</span>}
              </div>
            </div>
            <div className="manual-card-actions">
              {m.fileUrl && (
                <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary" onClick={(e) => e.stopPropagation()}>
                  <MdOpenInNew size={14} /> Open
                </a>
              )}
              {role === "admin" && (
                <>
                  <button className="btn btn-sm btn-outline" onClick={() => openEdit(m)}><MdEdit size={14} /> Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}><MdDelete size={14} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
