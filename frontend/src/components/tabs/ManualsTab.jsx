import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdMenuBook, MdAdd, MdDelete, MdDownload, MdSearch } from "react-icons/md";

export default function ManualsTab() {
  const { role } = useAuth();
  const [manuals, setManuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", description: "", category: "General", fileUrl: "", fileName: "" });

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

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api.createManual(form);
      toast.success("Manual uploaded");
      setShowForm(false);
      setForm({ title: "", description: "", category: "General", fileUrl: "", fileName: "" });
      load();
    } catch {
      toast.error("Failed to upload manual");
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

  const filtered = manuals.filter((m) =>
    m.title?.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase()) ||
    m.category?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdMenuBook size={22} /> Laboratory Manual Repository</h2>
        {role === "admin" && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><MdAdd size={16} /> Upload Manual</button>
        )}
      </div>

      <div className="search-box">
        <MdSearch size={18} />
        <input type="text" placeholder="Search manuals..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Upload Manual</h3>
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
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="manuals-grid">
        {filtered.length === 0 ? (
          <p className="empty-state">No manuals found</p>
        ) : filtered.map((m) => (
          <div className="manual-card" key={m.id}>
            <div className="manual-card-icon">
              <MdMenuBook size={32} />
            </div>
            <div className="manual-card-body">
              <h4>{m.title}</h4>
              <span className="badge badge-outline">{m.category}</span>
              {m.description && <p>{m.description}</p>}
              {m.fileName && <span className="manual-filename">{m.fileName}</span>}
            </div>
            <div className="manual-card-actions">
              {m.fileUrl && (
                <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
                  <MdDownload size={14} /> Open
                </a>
              )}
              {role === "admin" && (
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}><MdDelete size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
