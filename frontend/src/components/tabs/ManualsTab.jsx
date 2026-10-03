import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { fmtDate as formatDate } from "../../utils/helpers";
import { filterBySearch } from "../../utils/search";
import { COURSES } from "../../constants/courses";
import { LAB_ROOMS } from "../../constants/labRooms";
import {
  ALL,
  DEFAULT_MANUAL_CATEGORY,
  DEFAULT_MANUAL_STATUS,
  MANUAL_CATEGORIES,
  MANUAL_SORTS,
  MANUAL_STATUSES,
  MANUALS_PAGE_SIZE,
} from "../../constants/manuals";
import StatStrip from "../ui/StatStrip";
import FilterSelect from "../ui/FilterSelect";
import Pagination from "../ui/Pagination";
import ViewToggle from "../ui/ViewToggle";
import LoadingSpinner from "../ui/LoadingSpinner";
import useRowMenu from "../../hooks/useRowMenu";
import toast from "react-hot-toast";
import "../../styles/pages/catalog.css";
import "../../styles/pages/catalog-browser.css";
import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import { MdMenuBook, MdAdd, MdDelete, MdEdit, MdSearch, MdOpenInNew, MdCloudUpload, MdClose, MdInfo, MdAssignment, MdDescription, MdDownload, MdVisibility, MdClear, MdWarning, MdMoreVert, MdPictureAsPdf } from "react-icons/md";


const DASH = "\u2014";

const withAll = (allLabel, values) => [{ value: ALL, label: allLabel }, ...values];

const CATEGORY_OPTIONS = withAll("All Categories", MANUAL_CATEGORIES);
const COURSE_OPTIONS = withAll("All Courses", COURSES);
const SORT_OPTIONS = MANUAL_SORTS;

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

// Mirrors StatusPill in CatalogBrowser: a soft 12% tint with saturated text, so
// "Archived" reads as deliberately muted rather than as an error state.
function StatusPill({ status }) {
  const key = (status || "Active") === "Archived" ? "archived" : "active";
  return <span className={`cx-status cx-status--${key}`}>{status || DEFAULT_MANUAL_STATUS}</span>;
}

const EMPTY_FORM = {
  title: "", description: "", category: DEFAULT_MANUAL_CATEGORY, course: "", labRoom: "",
  status: DEFAULT_MANUAL_STATUS, fileUrl: "", fileName: "", fileSize: "", fileType: "", thumbnailUrl: "",
};

const VIEW_STORAGE_KEY = "labtrack-manuals-view";

/* The card's image band and title are div/h3 rather than <button>, so Enter and
   Space have to be wired up by hand. The band is the single tab stop (it also
   carries role="button"); the title stays a redundant mouse convenience so it
   does not add a duplicate tab stop for the same action. Without this the
   detail drawer is unreachable by keyboard in grid view, since the row kebab
   that exposes "Details" only exists in list view. */
function onCardKey(event, open) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  open();
}

export default function ManualsTab() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [manuals, setManuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState(ALL);
  const [filterCourse, setFilterCourse] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState("grid");
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  const [selectedManual, setSelectedManual] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openRowMenu, rowMenu] = useRowMenu({ containerClass: "catalog-kebab-wrap" });

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
    let result = filterBySearch(manuals, search, ["title", "description", "course", "lab_room", "fileName"]).filter((m) => {
      const matchCategory = filterCategory === ALL || m.category === filterCategory;
      const matchCourse = filterCourse === ALL || m.course === filterCourse;
      const matchStatus = filterStatus === ALL || (m.status || "Active") === filterStatus;
      return matchCategory && matchCourse && matchStatus;
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
  }, [manuals, search, filterCategory, filterCourse, filterStatus, sortBy]);

  // Render-phase reset, the pattern already used by useCatalogFilters.js:41 and
  // ViewToggle.jsx:18. Any filter change invalidates the page number, otherwise
  // page 7 of a 3-page result renders empty.
  const resetKeys = [search, filterCategory, filterCourse, filterStatus, sortBy];
  const [prevResetKeys, setPrevResetKeys] = useState(resetKeys);
  if (resetKeys.some((k, i) => prevResetKeys[i] !== k)) {
    setPrevResetKeys(resetKeys);
    setPage(1);
  }

// The manuals endpoint returns the whole collection, so the page slice is
// derived here rather than requested.
const totalPages = Math.max(1, Math.ceil(filtered.length / MANUALS_PAGE_SIZE));
// Clamped because deleting manuals can shrink totalPages while `page` is still
// high, and the filter reset above only fires on filter/sort changes. Without
// the clamp the slice comes back empty, and because Pagination returns null when
// totalPages <= 1 the user is left with a blank results area and no controls.
const safePage = Math.min(page, totalPages);
const paged = useMemo(() => {
  const start = (safePage - 1) * MANUALS_PAGE_SIZE;
  return filtered.slice(start, start + MANUALS_PAGE_SIZE);
}, [filtered, safePage]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (filterCategory !== ALL ? 1 : 0) +
    (filterCourse !== ALL ? 1 : 0) +
    (filterStatus !== ALL ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setSearch("");
    setFilterCategory(ALL);
    setFilterCourse(ALL);
    setFilterStatus(ALL);
    setSortBy("newest");
  }

  // The stat tiles are the status filter: tapping the active tile clears it.
  function selectStatus(next) {
    setFilterStatus((current) => (current === next ? ALL : next));
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

  if (loading) return <LoadingSpinner />;

  return (
    <section className="catalog-page">
        <StatStrip
          variant="stack"
          onSelect={selectStatus}
          activeKey={filterStatus}
          items={[
            { key: ALL, label: "Total Manuals", value: stats.total },
            { key: "Active", label: "Active", value: stats.active },
            { key: "Archived", label: "Archived", value: stats.archived },
          ]}
        />

        <div className="cx-toolbar">
          <div className="cx-search">
            <MdSearch size={16} />
            <input
              type="search"
              className="cx-search-input"
              placeholder="Search manuals by title, course, lab, file..."
              aria-label="Search manuals"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <FilterSelect label="Category" value={filterCategory} onChange={setFilterCategory} options={CATEGORY_OPTIONS} />
          <FilterSelect label="Course" value={filterCourse} onChange={setFilterCourse} options={COURSE_OPTIONS} />

          <select
            className="cx-select cx-select--sort"
            aria-label="Sort"
            title="Sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey={VIEW_STORAGE_KEY} />

          <div className="cx-toolbar-tail">
            {hasActiveFilters && (
              <button className="manuals-clear-btn" onClick={clearFilters}>
                <MdClear size={14} /> Clear
              </button>
            )}
            <Pagination
              compact
              maxVisible={5}
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={MANUALS_PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>

          {isAdmin && (
            <div className="cx-toolbar-actions">
              <button className="btn btn-green" onClick={openAdd}>
                <MdAdd size={16} /> Upload Manual
              </button>
            </div>
          )}
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
                        {MANUAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <MdAssignment size={16} />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="lab-form-field">
                      <label>Status</label>
                      <div className="lab-input-wrap">
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                          {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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

      {filtered.length === 0 ? (
          <div className="catalog-empty">
            <MdMenuBook size={48} />
            <h3>{hasActiveFilters ? "No matching manuals" : "No manuals yet"}</h3>
            <p>
              {hasActiveFilters
                ? "No laboratory manual matches the current filters."
                : isAdmin
                  ? "Upload a laboratory manual to make it available to students."
                  : "Laboratory manuals will appear here once they are uploaded."
              }
            </p>
            {hasActiveFilters ? (
              <button className="btn btn-outline" onClick={clearFilters}><MdClear size={14} /> Clear filters</button>
            ) : isAdmin ? (
              <button className="btn btn-green" onClick={openAdd}><MdAdd size={16} /> Upload Manual</button>
            ) : null}
          </div>
        ) : viewMode === "grid" ? (
          <div className="cx-results">
            <div className="cx-grid">
              {paged.map((m) => {
                const fileType = getFileType(m.file_name);
                return (
                  <div className="cx-card manual-card-interactive" key={m.id}>
                    <div
                      className="cx-card-image"
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${m.title || "manual"}`}
                      onClick={() => openDetail(m)}
                      onKeyDown={(e) => onCardKey(e, () => openDetail(m))}
                    >
                      {m.thumbnail_url ? (
                        <img
                          src={m.thumbnail_url}
                          alt=""
                          loading="lazy"
                          width="200"
                          height="150"
                          decoding="async"
                        />
                      ) : (
                        <div className="cx-card-placeholder">
                          {fileType ? <MdPictureAsPdf size={30} style={{ color: fileType.color }} /> : <MdMenuBook size={30} />}
                          <span>{fileType ? fileType.label : "No preview"}</span>
                        </div>
                      )}
                      <span className="cx-card-status">
                        <StatusPill status={m.status} />
                      </span>
                    </div>
                    <div className="cx-card-body">
                      <h3 className="cx-card-title" title={m.title} onClick={() => openDetail(m)}>
                        {m.title || DASH}
                      </h3>
                      <div className="cx-card-meta">
                        {m.category && <span className="category-pill">{m.category}</span>}
                        {m.course && <span className="category-pill cx-pill-course">{m.course}</span>}
                        {m.lab_room && <span className="category-pill">{m.lab_room}</span>}
                      </div>
                      <div className="cx-card-actions">
                        {m.file_url && (
                          <button
                            className="cx-card-btn"
                            title="Open manual"
                            aria-label="Open manual"
                            onClick={() => window.open(m.file_url, "_blank", "noopener,noreferrer")}
                          >
                            <MdOpenInNew size={15} />
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button className="cx-card-btn" title="Edit" aria-label="Edit" onClick={() => openEdit(m)}>
                              <MdEdit size={15} />
                            </button>
                            <button className="cx-card-btn cx-card-btn--danger" title="Delete" aria-label="Delete" onClick={() => confirmDelete(m)}>
                              <MdDelete size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="cx-results">
            <div className="cx-table-wrap">
              <table className="cx-table">
                <thead>
                  <tr>
                    <th className="cx-th-item">Manual</th>
                    <th>Category</th>
                    <th>Course</th>
                    <th>Laboratory</th>
                    <th>Status</th>
                    <th>Size</th>
                    <th className="cx-th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((m) => (
                    <tr key={m.id}>
                      <td className="cx-td-item">
                        <div className="cx-item">
                          <span className={`cx-thumb cx-thumb--empty manual-thumb-${(getFileType(m.file_name)?.label || "file").toLowerCase()}`}>
                            {getFileType(m.file_name)?.label || <MdMenuBook size={16} />}
                          </span>
                          <div className="cx-item-text">
                            <span className="cx-item-name" title={m.title}>{m.title || DASH}</span>
                            <span className="cx-item-sub" title={m.file_name}>{m.file_name || "No file"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{m.category ? <span className="category-pill">{m.category}</span> : <span className="cx-none">{DASH}</span>}</td>
                      <td>{m.course || <span className="cx-none">{DASH}</span>}</td>
                      <td>{m.lab_room || <span className="cx-none">{DASH}</span>}</td>
                      <td><StatusPill status={m.status} /></td>
                      <td>{m.file_size || <span className="cx-none">{DASH}</span>}</td>
                      <td className="cx-td-actions">
                        <div className="catalog-kebab-wrap">
                          <button
                            className="catalog-kebab-btn"
                            aria-haspopup="true"
                            aria-expanded={openRowMenu === m.id}
                            aria-label={`Actions for ${m.title || "manual"}`}
                            onClick={(e) => { e.stopPropagation(); rowMenu.toggle(m.id); }}
                          >
                            <MdMoreVert size={18} />
                          </button>
                          {openRowMenu === m.id && (
                            /* No role="menu", matching CatalogBrowser: the popup
                               mixes actions and is not a menuitem-only container. */
                            <div className="catalog-kebab-dropdown">
                              {m.file_url && (
                                <button onClick={() => { window.open(m.file_url, "_blank", "noopener,noreferrer"); rowMenu.close(); }}>
                                  <MdOpenInNew size={15} /> Open manual
                                </button>
                              )}
                              <button onClick={() => { openDetail(m); rowMenu.close(); }}>
                                <MdVisibility size={15} /> Details
                              </button>
                              {isAdmin && (
                                <>
                                  <div className="cx-kebab-divider" />
                                  <button onClick={() => { openEdit(m); rowMenu.close(); }}>
                                    <MdEdit size={15} /> Edit
                                  </button>
                                  <button className="danger" onClick={() => { confirmDelete(m); rowMenu.close(); }}>
                                    <MdDelete size={15} /> Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
  );
}
