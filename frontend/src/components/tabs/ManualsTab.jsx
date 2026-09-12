import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { COURSES } from "../../constants/courses";
import { LAB_ROOMS } from "../../constants/labRooms";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import { MdMenuBook, MdAdd, MdDelete, MdEdit, MdSearch, MdOpenInNew, MdCloudUpload, MdClose, MdInfo, MdAssignment, MdDescription, MdDownload, MdVisibility, MdFilterList, MdSort, MdClear, MdWarning } from "react-icons/md";


const CATEGORIES = ["All", "General", "Safety", "Equipment Guide", "Software", "Procedure", "Other"];
const STATUSES = ["Active", "Archived"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
];

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
  mp4: { color: "#c62828", label: "VID" },
};

function getFileType(fileName) {
  if (!fileName) return null;
  const ext = fileName.split(".").pop().toLowerCase();
  return FILE_TYPE_ICONS[ext] || null;
}

function formatDate(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(date) {
  if (!date) return "";
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
  return formatDate(date);
}

const EMPTY_FORM = {
  title: "", description: "", category: "General", course: "", labRoom: "",
  status: "Active", fileUrl: "", fileName: "", fileSize: "", fileType: "", thumbnailUrl: "",
};

export default function ManualsTab() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [manuals, setManuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterCourse, setFilterCourse] = useState("All");
  const [filterLabRoom, setFilterLabRoom] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  const [selectedManual, setSelectedManual] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    active: manuals.filter((m) => (m.status || "Active") === "Active").length,
    archived: manuals.filter((m) => m.status === "Archived").length,
  }), [manuals]);

  const filtered = useMemo(() => {
    let result = manuals.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.course && m.course.toLowerCase().includes(q)) ||
        (m.lab_room && m.lab_room.toLowerCase().includes(q)) ||
        (m.fileName && m.fileName.toLowerCase().includes(q));
      const matchCategory = filterCategory === "All" || m.category === filterCategory;
      const matchCourse = filterCourse === "All" || m.course === filterCourse;
      const matchLabRoom = filterLabRoom === "All" || m.lab_room === filterLabRoom;
      const matchStatus = filterStatus === "All" || (m.status || "Active") === filterStatus;
      return matchSearch && matchCategory && matchCourse && matchLabRoom && matchStatus;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case "title-asc":
          return (a.title || "").localeCompare(b.title || "");
        case "title-desc":
          return (b.title || "").localeCompare(a.title || "");
        case "newest":
        default:
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    return result;
  }, [manuals, search, filterCategory, filterCourse, filterLabRoom, filterStatus, sortBy]);

  const hasActiveFilters = search || filterCategory !== "All" || filterCourse !== "All" || filterLabRoom !== "All" || filterStatus !== "All";

  function clearFilters() {
    setSearch("");
    setFilterCategory("All");
    setFilterCourse("All");
    setFilterLabRoom("All");
    setFilterStatus("All");
    setSortBy("newest");
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(m) {
    setForm({
      title: m.title || "", description: m.description || "", category: m.category || "General",
      course: m.course || "", labRoom: m.lab_room || "", status: m.status || "Active",
      fileUrl: m.file_url || "", fileName: m.file_name || "",
      fileSize: m.file_size || "", fileType: m.file_type || "", thumbnailUrl: m.thumbnail_url || "",
    });
    setEditing(m);
    setShowForm(true);
  }

  function openDetail(m) {
    setSelectedManual(m);
    setShowDetail(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        title: form.title, description: form.description, category: form.category,
        course: form.course, labRoom: form.labRoom, status: form.status,
        fileUrl: form.fileUrl, fileName: form.fileName, fileSize: form.fileSize,
        fileType: form.fileType || (form.fileName ? form.fileName.split(".").pop().toLowerCase() : ""),
        thumbnailUrl: form.thumbnailUrl,
      };
      if (editing) {
        await api.updateManual(editing.id, payload);
        toast.success("Laboratory manual updated successfully");
      } else {
        await api.createManual(payload);
        toast.success("Laboratory manual uploaded successfully");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error(editing ? "Failed to update manual" : "Unable to upload manual. Please check the file type and size.");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be under 50MB");
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.uploadDocument(file);
      const ext = file.name.split(".").pop().toLowerCase();
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`;
      setForm((f) => ({
        ...f, fileUrl: url, fileName: file.name,
        fileType: ext, fileSize: sizeStr,
      }));
      toast.success("File uploaded!");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(m) {
    setDeleteTarget(m);
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    try {
      await api.deleteManual(deleteTarget.id);
      toast.success("Laboratory manual deleted successfully");
      setDeleteTarget(null);
      if (showDetail && selectedManual?.id === deleteTarget.id) {
        setSelectedManual(null);
        setShowDetail(false);
      }
      load();
    } catch {
      toast.error("Failed to delete manual");
    }
  }

  function handleDownload(m) {
    if (!m.file_url) return;
    const a = document.createElement("a");
    a.href = m.file_url;
    a.download = m.file_name || "manual";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      {isAdmin && (
        <button className="hero-action-btn ghost" onClick={openAdd}><MdAdd size={16} /> Upload Manual</button>
      )}

      <div className="manuals-stats">
        <div className={`manuals-stat-card ${filterStatus === "All" ? "active" : ""}`} onClick={() => setFilterStatus("All")}>
          <div className="manuals-stat-icon total"><MdMenuBook size={20} /></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.total}</span>
            <span className="manuals-stat-label">Total Manuals</span>
          </div>
        </div>
        <div className={`manuals-stat-card ${filterStatus === "Active" ? "active" : ""}`} onClick={() => setFilterStatus(filterStatus === "Active" ? "All" : "Active")}>
          <div className="manuals-stat-icon active"><MdMenuBook size={20} /></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.active}</span>
            <span className="manuals-stat-label">Active</span>
          </div>
        </div>
        <div className={`manuals-stat-card ${filterStatus === "Archived" ? "active" : ""}`} onClick={() => setFilterStatus(filterStatus === "Archived" ? "All" : "Archived")}>
          <div className="manuals-stat-icon archived"><MdMenuBook size={20} /></div>
          <div className="manuals-stat-info">
            <span className="manuals-stat-number">{stats.archived}</span>
            <span className="manuals-stat-label">Archived</span>
          </div>
        </div>
      </div>

      <div className="manuals-toolbar">
        <div className="manuals-filters-row">
          <div className="manuals-search">
            <MdSearch size={16} />
            <input type="text" placeholder="Search by title, course, lab, description..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="manuals-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>)}
          </select>
          <select className="manuals-select" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
            <option value="All">All Courses</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="manuals-select" value={filterLabRoom} onChange={(e) => setFilterLabRoom(e.target.value)}>
            <option value="All">All Labs</option>
            {LAB_ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="manuals-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {hasActiveFilters && (
            <button className="manuals-clear-btn" onClick={clearFilters}><MdClear size={14} /> Clear</button>
          )}
        </div>
      </div>

      {showForm && (
        <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
          <div className="lab-slide-header">
            <h2>{editing ? "Edit Manual" : "Upload Manual"}</h2>
            <button className="lab-slide-close" onClick={() => { setShowForm(false); setEditing(null); }}><MdClose size={20} /></button>
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
                  <label>Manual Title <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Laboratory Manual for CP101" />
                    <MdEdit size={16} />
                  </div>
                </div>
                <div className="lab-form-row">
                  <div className="lab-form-field">
                    <label>Course/Subject</label>
                    <div className="lab-input-wrap">
                      <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
                        <option value="">Select course</option>
                        {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <MdAssignment size={16} />
                    </div>
                  </div>
                  <div className="lab-form-field">
                    <label>Laboratory</label>
                    <div className="lab-input-wrap">
                      <select value={form.labRoom} onChange={(e) => setForm({ ...form, labRoom: e.target.value })}>
                        <option value="">Select laboratory</option>
                        {LAB_ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <MdAssignment size={16} />
                    </div>
                  </div>
                </div>
                <div className="lab-form-row">
                  <div className="lab-form-field">
                    <label>Category</label>
                    <div className="lab-input-wrap">
                      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <MdAssignment size={16} />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="lab-form-field">
                      <label>Status</label>
                      <div className="lab-input-wrap">
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <MdAssignment size={16} />
                      </div>
                    </div>
                  )}
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
                      <div className="manual-file-info">
                        <span className="manual-file-name">{form.fileName || "Uploaded file"}</span>
                        {form.fileSize && <span className="manual-file-size">{form.fileSize}</span>}
                      </div>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setForm((f) => ({ ...f, fileUrl: "", fileName: "", fileSize: "", fileType: "" }))}>Remove</button>
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
                <div className="lab-form-field">
                  <label>Thumbnail/Cover URL (optional)</label>
                  <div className="lab-input-wrap">
                    <input type="url" value={form.thumbnailUrl} onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })} placeholder="https://..." />
                    <MdInfo size={16} />
                  </div>
                </div>
              </div>

              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-description"><MdDescription size={14} /></div>
                  <span className="lab-form-section-title">Details</span>
                </div>
                <div className="lab-form-field">
                  <label>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Brief description of the laboratory manual..." />
                </div>
              </div>

              <div className="lab-form-actions">
                <button type="button" className="lab-form-cancel-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                <button type="submit" className="lab-form-submit-btn" disabled={!form.fileUrl}>{editing ? "Update" : "Upload"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showForm && <div className="lab-slide-backdrop" onClick={() => { setShowForm(false); setEditing(null); }} />}

      {showDetail && selectedManual && (
        <div className={`lab-slide-panel ${showDetail ? "open" : ""}`}>
          <div className="lab-slide-header">
            <h2>Manual Details</h2>
            <button className="lab-slide-close" onClick={() => { setSelectedManual(null); setShowDetail(false); }}><MdClose size={20} /></button>
          </div>
          <div className="lab-slide-body">
            <div className="lab-slide-accent" />
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details"><MdMenuBook size={14} /></div>
                <span className="lab-form-section-title">Status</span>
              </div>
              <div className="manual-detail-badges">
                <span className={`manual-status-badge ${(selectedManual.status || "Active") === "Active" ? "active" : "archived"}`}>
                  {selectedManual.status || "Active"}
                </span>
                {selectedManual.category && (
                  <span className="manual-category-badge">{selectedManual.category}</span>
                )}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-classification"><MdInfo size={14} /></div>
                <span className="lab-form-section-title">Information</span>
              </div>
              <div className="manual-detail-info">
                <div className="manual-info-row"><span className="manual-info-label">Title</span><span className="manual-info-value">{selectedManual.title}</span></div>
                {selectedManual.course && <div className="manual-info-row"><span className="manual-info-label">Course</span><span className="manual-info-value">{selectedManual.course}</span></div>}
                {selectedManual.lab_room && <div className="manual-info-row"><span className="manual-info-label">Laboratory</span><span className="manual-info-value">{selectedManual.lab_room}</span></div>}
                {selectedManual.uploaderName && <div className="manual-info-row"><span className="manual-info-label">Uploaded by</span><span className="manual-info-value">{selectedManual.uploaderName}</span></div>}
                {selectedManual.created_at && <div className="manual-info-row"><span className="manual-info-label">Upload date</span><span className="manual-info-value">{formatDate(selectedManual.created_at)}</span></div>}
                {selectedManual.updated_at && selectedManual.updated_at !== selectedManual.created_at && (
                  <div className="manual-info-row"><span className="manual-info-label">Last updated</span><span className="manual-info-value">{formatDate(selectedManual.updated_at)}</span></div>
                )}
                {selectedManual.file_name && <div className="manual-info-row"><span className="manual-info-label">File</span><span className="manual-info-value">{selectedManual.file_name}</span></div>}
                {selectedManual.file_type && <div className="manual-info-row"><span className="manual-info-label">File type</span><span className="manual-info-value">{selectedManual.file_type.toUpperCase()}</span></div>}
                {selectedManual.file_size && <div className="manual-info-row"><span className="manual-info-label">File size</span><span className="manual-info-value">{selectedManual.file_size}</span></div>}
              </div>
            </div>

            {selectedManual.description && (
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-description"><MdDescription size={14} /></div>
                  <span className="lab-form-section-title">Description</span>
                </div>
                <div className="manual-detail-desc">
                  <p>{selectedManual.description}</p>
                </div>
              </div>
            )}

            {selectedManual.file_url && selectedManual.file_type === "pdf" && (
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-evidence"><MdVisibility size={14} /></div>
                  <span className="lab-form-section-title">Preview</span>
                </div>
                <div className="manual-pdf-preview">
                  <iframe
                    src={selectedManual.file_url}
                    title={selectedManual.title}
                    className="manual-pdf-frame"
                  />
                </div>
              </div>
            )}

            <div className="manual-detail-actions">
              {selectedManual.file_url && (
                <a href={selectedManual.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <MdOpenInNew size={14} /> Open
                </a>
              )}
              {selectedManual.file_url && (
                <button className="btn btn-outline" onClick={() => handleDownload(selectedManual)}>
                  <MdDownload size={14} /> Download
                </button>
              )}
              {isAdmin && (
                <>
                  <button className="btn btn-outline" onClick={() => { setShowDetail(false); setSelectedManual(null); openEdit(selectedManual); }}>
                    <MdEdit size={14} /> Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => confirmDelete(selectedManual)}>
                    <MdDelete size={14} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {showDetail && <div className="lab-slide-backdrop" onClick={() => { setSelectedManual(null); setShowDetail(false); }} />}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content manual-delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="manual-delete-icon"><MdWarning size={32} /></div>
            <h3>Delete Manual</h3>
            <p>Are you sure you want to delete <strong>{deleteTarget.title}</strong>?</p>
            <p className="manual-delete-sub">This action cannot be undone.</p>
            <div className="manual-delete-actions">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={executeDelete}><MdDelete size={14} /> Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="manuals-grid">
        {filtered.length === 0 ? (
          <div className="manuals-empty">
            <MdMenuBook size={48} />
            <h3>No Laboratory Manuals Available</h3>
            <p>
              {hasActiveFilters
                ? "No matching manuals found. Try adjusting your search or filters."
                : isAdmin
                  ? "Upload a laboratory manual to make it available to students."
                  : "Laboratory manuals will appear here once they are uploaded."
              }
            </p>
            {hasActiveFilters && <button className="btn btn-outline" onClick={clearFilters} style={{ marginTop: 12 }}><MdClear size={14} /> Clear Filters</button>}
          </div>
        ) : filtered.map((m) => {
          const fileType = getFileType(m.file_name);
          return (
            <div className="manual-card" key={m.id} onClick={() => openDetail(m)}>
              <div className="manual-card-top">
                <div className="manual-card-icon">
                  {fileType ? (
                    <div className="manual-icon-inner" style={{ color: fileType.color }}>
                      <MdMenuBook size={28} />
                      <span className="manual-file-badge" style={{ background: `${fileType.color}15`, color: fileType.color, border: `1px solid ${fileType.color}30` }}>{fileType.label}</span>
                    </div>
                  ) : (
                    <div className="manual-icon-inner"><MdMenuBook size={28} /></div>
                  )}
                </div>
                <div className="manual-card-top-right">
                  <span className={`manual-status-dot ${(m.status || "Active") === "Active" ? "active" : "archived"}`} />
                  <span className="manual-card-category">{m.category}</span>
                </div>
              </div>
              <div className="manual-card-body">
                <h4 title={m.title}>{m.title}</h4>
                <div className="manual-card-badges">
                  {m.course && <span className="manual-badge course">{m.course}</span>}
                  {m.lab_room && <span className="manual-badge lab">{m.lab_room}</span>}
                </div>
                {m.description && <p className="manual-card-desc" title={m.description}>{m.description}</p>}
              </div>
              <div className="manual-card-footer">
                <div className="manual-card-meta">
                  {m.created_at && <span className="manual-meta-date">{timeAgo(m.updated_at || m.created_at)}</span>}
                  {m.uploaderName && <span className="manual-meta-uploader">by {m.uploaderName}</span>}
                  {m.file_size && <span className="manual-meta-size">{m.file_size}</span>}
                </div>
                <div className="manual-card-actions">
                  {m.file_url && (
                    <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary manual-open-btn" onClick={(e) => e.stopPropagation()}>
                      <MdOpenInNew size={14} /> Open
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
