/**
 * Safety Rules tab.
 *
 * Replaces the Laboratory Manuals tab in the UI. The Manuals module itself is retained
 * on the backend (records and files untouched) but is no longer routed to from here --
 * see docs/migrations/manuals-to-safety-rules-conversion.md, which is NOT executed.
 *
 * COURSE VISIBILITY IS A BACKEND PROPERTY, NOT THIS FILE'S. Every list, view, upload,
 * edit, delete and file open goes through /api/safety-rules, which scopes by the caller's
 * verified profile and returns 404 for anything outside it. The filtering here is for
 * presentation and for hiding actions the caller cannot take anyway.
 *
 * FILES ARE OPENED THROUGH THE API, NEVER BY URL. `openFile` calls /api/safety-rules/:id/
 * file so the course check runs on every open. The Cloudinary delivery URL is not stored
 * on the row and is never held by this component.
 *
 * STYLING: the four stylesheets below are the SAME ones ManualsTab imports. They are not
 * optional decoration -- `lab-*` and `cx-*` have no other definition anywhere in the app,
 * so without them every class here resolves to nothing and the layout collapses into a
 * plain document flow. The markup deliberately mirrors ManualsTab's structures rather than
 * inventing its own, because the panel, field and card markup are load-bearing: a field is
 * `label` + `.lab-input-wrap` + control, and the slide-over needs the `.open` class to
 * render at all.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { COURSES } from "../../constants/courses";
import LoadingSpinner from "../ui/LoadingSpinner";
import {
  MdHealthAndSafety,
  MdAdd,
  MdDelete,
  MdEdit,
  MdSearch,
  MdOpenInNew,
  MdCloudUpload,
  MdClose,
  MdDescription,
  MdInfo,
  MdCategory,
  MdMeetingRoom,
  MdPictureAsPdf,
} from "react-icons/md";
import { toast } from "react-hot-toast";

import "../../styles/pages/catalog.css";
import "../../styles/pages/catalog-browser.css";
import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// The server is authoritative. This only keeps the picker from offering a type the API
// will refuse; server-side the decision is made on the file's magic bytes, so renaming an
// executable to .png does not get past this either.
const ACCEPTED = "image/jpeg,image/png,application/pdf";

const CATEGORIES = ["General", "PPE", "Equipment", "Emergency", "Housekeeping", "Procedure"];
const STATUSES = ["Active", "Archived"];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "General",
  course: "",
  labRoom: "",
  status: "Active",
  filePublicId: null,
  fileFormat: null,
  fileName: "",
  fileSize: "",
  fileType: "",
};

const fileLabel = (name) => {
  if (!name) return { label: "No file", color: "#8aa" };
  const ext = String(name).split(".").pop().toLowerCase();
  if (ext === "pdf") return { label: "PDF", color: "#e5534b" };
  if (ext === "png") return { label: "PNG", color: "#4b9ae5" };
  if (ext === "jpg" || ext === "jpeg") return { label: "JPG", color: "#4b9ae5" };
  return { label: ext.toUpperCase() || "FILE", color: "#8aa" };
};

export default function SafetyRulesTab() {
  const { userProfile, role } = useAuth();
  const isAdmin = role === "admin";
  const isSuper = userProfile?.adminLevel === "super";

  // Students carry `course` on their Firestore document; admins carry `courseId` and have
  // NO `course` field at all. Reading only `course` therefore showed an em dash for every
  // admin, which is the same class of bug as trusting one field name across both roles.
  const myCourse = String(userProfile?.course || userProfile?.courseId || "");

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const fileInputRef = useRef(null);

  // Refresh after a write. Deliberately NOT the same function the mount effect uses: that
  // one owns a cancellation flag, and sharing it would either drop a refresh that raced an
  // unmount-remount or reintroduce a synchronous setState in the effect body.
  const load = async () => {
    try {
      const data = await api.getSafetyRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || "Could not load safety rules");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSafetyRules();
        if (!cancelled) setRules(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Could not load safety rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) =>
      [r.title, r.description, r.category, r.course, r.lab_room, r.file_name]
        .some((v) => String(v || "").toLowerCase().includes(q)),
    );
  }, [rules, search]);

  const openAdd = () => {
    setEditing(null);
    // A Course Admin starts pre-filled with its own course and cannot change it; a Super
    // Admin chooses. The server enforces this either way -- see safetyRuleController.
    setForm({ ...EMPTY_FORM, course: isSuper ? "" : myCourse });
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm({
      title: rule.title || "",
      description: rule.description || "",
      category: rule.category || "General",
      course: rule.course || "",
      labRoom: rule.lab_room || "",
      status: rule.status || "Active",
      filePublicId: null,
      fileFormat: null,
      fileName: rule.file_name || "",
      fileSize: rule.file_size || "",
      fileType: rule.file_type || "",
    });
    setShowForm(true);
  };

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is larger than the 10 MB limit");
      return;
    }
    setUploading(true);
    try {
      const up = await api.uploadSafetyRuleFile(file);
      setForm((f) => ({
        ...f,
        filePublicId: up.publicId,
        fileFormat: up.format,
        fileName: up.fileName,
        fileSize: up.fileSize,
        fileType: up.fileType,
      }));
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const course = isSuper ? form.course : myCourse;
    if (!course) {
      toast.error("Select a course");
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      course,
      labRoom: form.labRoom,
      status: form.status,
      filePublicId: form.filePublicId,
      fileFormat: form.fileFormat,
      fileName: form.fileName,
      fileSize: form.fileSize,
      fileType: form.fileType,
    };
    try {
      if (editing) {
        await api.updateSafetyRule(editing.id, payload);
        toast.success("Safety rule updated");
      } else {
        await api.createSafetyRule(payload);
        toast.success("Safety rule added");
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not save the safety rule");
    }
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    try {
      await api.deleteSafetyRule(target.id);
      toast.success("Safety rule deleted");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not delete the safety rule");
      setDeleteTarget(null);
    }
  }

  /**
   * Opens the attached file through the API, in a new tab.
   *
   * There is deliberately no fallback to a stored URL. The row carries no delivery URL at
   * all -- toClientRule() strips it -- so there is nothing here that could leak one even
   * if this component wanted to.
   */
  function openFile(rule) {
    const win = window.open(api.safetyRuleFileUrl(rule.id), "_blank", "noopener,noreferrer");
    if (!win) {
      // A blocked popup is not an auth failure; say so rather than implying denial.
      toast("Allow pop-ups for this site to open the file.");
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <section className="catalog-page">
      <div className="cx-toolbar">
        <div className="cx-search">
          <MdSearch size={16} />
          <input
            type="search"
            className="cx-search-input"
            placeholder="Search safety rules by title, course, lab, file..."
            aria-label="Search safety rules"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cx-toolbar-actions">
          {isAdmin && (
            <button className="btn btn-green" onClick={openAdd}>
              <MdAdd size={16} /> Add Safety Rule
            </button>
          )}
        </div>
      </div>

      {!isAdmin && myCourse ? (
        <div className="lab-form-field" style={{ marginBottom: 12 }}>
          <label>Showing rules for your course</label>
          <div className="lab-input-wrap">
            <input type="text" value={myCourse} readOnly />
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <MdHealthAndSafety size={48} />
          <h3>{search.trim() ? "No matching safety rules" : "No safety rules yet"}</h3>
          <p>
            {search.trim()
              ? "No safety rule matches your search."
              : isAdmin
                ? "Add a safety rule so your students can read it."
                : "Safety rules will appear here once they are published."}
          </p>
        </div>
      ) : (
        <div className="cx-grid">
          {filtered.map((rule) => {
            const ft = fileLabel(rule.file_name);
            return (
              <div className="cx-card" key={rule.id}>
                <div className="cx-card-image">
                  <div className="cx-card-placeholder">
                    <MdPictureAsPdf size={30} style={{ color: ft.color }} />
                    <span>{ft.label}</span>
                  </div>
                  <span className="cx-card-status">
                    <span className={`manual-status-badge ${rule.status === "Archived" ? "archived" : "active"}`}>
                      {rule.status || "Active"}
                    </span>
                  </span>
                </div>

                <div className="cx-card-body">
                  <h3 className="cx-card-title" title={rule.title}>
                    {rule.title || "Untitled"}
                  </h3>

                  {rule.description ? (
                    <p className="cx-item-sub">{rule.description}</p>
                  ) : null}

                  <div className="cx-card-meta">
                    {rule.category && <span className="category-pill">{rule.category}</span>}
                    {rule.course && <span className="category-pill cx-pill-course">{rule.course}</span>}
                    {rule.lab_room && <span className="category-pill">{rule.lab_room}</span>}
                  </div>

                  <div className="cx-card-actions">
                    {rule.has_file && (
                      <button
                        className="cx-card-btn"
                        title="Open file"
                        aria-label="Open file"
                        onClick={() => openFile(rule)}
                      >
                        <MdOpenInNew size={15} />
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          className="cx-card-btn"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => openEdit(rule)}
                        >
                          <MdEdit size={15} />
                        </button>
                        <button
                          className="cx-card-btn cx-card-btn--danger"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => setDeleteTarget(rule)}
                        >
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
      )}

      {/* ---- slide-over form ---- */}
      {showForm && (
        <div className="lab-slide-panel open">
          <div className="lab-slide-header">
            <h2>{editing ? "Edit Safety Rule" : "Add Safety Rule"}</h2>
            <button
              className="lab-slide-close"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              <MdClose size={20} />
            </button>
          </div>

          <div className="lab-slide-body">
            <div className="lab-slide-accent" />
            <form onSubmit={handleSubmit} noValidate>
              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-details">
                    <MdInfo size={14} />
                  </div>
                  <span className="lab-form-section-title">Rule Info</span>
                </div>

                <div className="lab-form-field">
                  <label>
                    Title <span className="lab-required" />
                  </label>
                  <div className="lab-input-wrap">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Laboratory Safety Rules"
                    />
                    <MdEdit size={16} />
                  </div>
                </div>

                <div className="lab-form-field">
                  <label>
                    Course <span className="lab-required" />
                  </label>
                  <div className="lab-input-wrap">
                    {isSuper ? (
                      <select
                        value={form.course}
                        onChange={(e) => setForm({ ...form, course: e.target.value })}
                      >
                        <option value="">Select course</option>
                        {COURSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      // Locked, not trusted: the server rejects any course outside the
                      // caller's scope regardless of what is posted.
                      <input type="text" value={myCourse || "—"} readOnly />
                    )}
                    <MdCategory size={16} />
                  </div>
                </div>

                <div className="lab-form-row">
                  <div className="lab-form-field">
                    <label>Category</label>
                    <div className="lab-input-wrap">
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <MdCategory size={16} />
                    </div>
                  </div>

                  <div className="lab-form-field">
                    <label>Status</label>
                    <div className="lab-input-wrap">
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <MdCategory size={16} />
                    </div>
                  </div>
                </div>

                <div className="lab-form-field">
                  <label>Laboratory Room</label>
                  <div className="lab-input-wrap">
                    <input
                      type="text"
                      value={form.labRoom}
                      onChange={(e) => setForm({ ...form, labRoom: e.target.value })}
                      placeholder="e.g. Networking Lab"
                    />
                    <MdMeetingRoom size={16} />
                  </div>
                </div>
              </div>

              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-description">
                    <MdDescription size={14} />
                  </div>
                  <span className="lab-form-section-title">Description</span>
                </div>
                <div className="lab-form-field">
                  <label>Instructions</label>
                  <div className="lab-input-wrap">
                    <textarea
                      rows={4}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="What must students do before entering this laboratory?"
                    />
                  </div>
                </div>
              </div>

              <div className="lab-form-section">
                <div className="lab-form-section-header">
                  <div className="lab-form-section-icon inc-evidence">
                    <MdCloudUpload size={14} />
                  </div>
                  <span className="lab-form-section-title">File</span>
                </div>
                <div className="lab-form-field">
                  <label>Upload</label>
                  <label className="manual-upload-btn">
                    <MdCloudUpload size={18} />
                    {uploading ? "Uploading..." : "Choose a file"}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED}
                      onChange={handleFileUpload}
                      hidden
                      disabled={uploading}
                    />
                  </label>
                  <span className="manual-file-info">
                    JPG, PNG or PDF, up to 10 MB. The file is opened through the API, so
                    course permissions apply on every view.
                  </span>
                  {form.fileName ? (
                    <span className="manual-file-name">
                      {form.fileName}
                      {form.fileSize ? ` · ${form.fileSize}` : ""}
                    </span>
                  ) : null}
                  {editing && !form.filePublicId ? (
                    <span className="manual-file-size">
                      Upload a file to replace the current one. Leave empty to keep it.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="lab-form-actions">
                <button type="submit" className="lab-form-submit-btn">
                  <MdCloudUpload size={16} />
                  {editing ? "Save changes" : "Add rule"}
                </button>
                <button
                  type="button"
                  className="lab-form-cancel-btn"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showForm && (
        <div
          className="lab-slide-backdrop"
          onClick={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {/* ---- delete confirmation ---- */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content manual-delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="manual-delete-icon">
              <MdDelete size={22} />
            </div>
            <h3>Delete safety rule?</h3>
            <p className="manual-delete-sub">
              “{deleteTarget.title}” will be removed for everyone in its course. This cannot
              be undone.
            </p>
            <div className="manual-delete-actions">
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}