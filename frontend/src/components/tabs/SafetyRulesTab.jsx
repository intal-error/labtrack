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
 * FILE ACCESS -- READ THIS BEFORE ADDING AN <img src> OR window.open()
 *
 * The file endpoint requires `Authorization: Bearer`. An <img> tag and a new browser tab
 * both cannot attach a header, so `src={api.safetyRuleFileUrl(id)}` and
 * `window.open(api.safetyRuleFileUrl(id))` BOTH FAIL WITH 401. Everything here goes
 * through api.fetchSafetyRuleFileUrl(), which authenticates and returns a blob object URL.
 *
 * Two rules that go with that, and both are easy to get wrong:
 *   1. Every createObjectURL has exactly one matching revokeObjectURL. useObjectUrl()
 *      below owns the lifecycle so a card that changes its file, a panel that closes, and
 *      an unmount all release it.
 *   2. One fetch per file id. useObjectUrl caches by id and skips the network entirely on
 *      a repeat, so opening and closing the detail panel does not re-download.
 *
 * NO CLOUDINARY URL IS HELD ANYWHERE. The API payload strips file_public_id, file_url and
 * thumbnail_url, so there is nothing here that could leak a storage reference even by
 * accident. NOTE this is not the same as the underlying Cloudinary assets being private:
 * they are not -- see docs/known-issues/safety-rules-file-access.md.
 *
 * STYLING: the four stylesheets below are the SAME ones ManualsTab imports. They are not
 * optional decoration -- `lab-*` and `cx-*` have no other definition anywhere in the app,
 * so without them every class here resolves to nothing and the layout collapses.
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
  MdImage,
  MdInsertDriveFile,
  MdInfoOutline,
} from "react-icons/md";
import { toast } from "react-hot-toast";

import "../../styles/pages/catalog.css";
import "../../styles/pages/catalog-browser.css";
import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import "../../styles/pages/safety-rules.css";

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

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

/**
 * Classifies a rule by its stored file name.
 *
 * The declared file_type is NOT trusted for this: it comes from the request body and a
 * caller could label a PDF as image/png, which would make the browser try to decode a PDF
 * as an image and show a broken glyph. The extension is equally client-supplied, so this
 * only decides WHICH rendering to attempt -- a wrong guess degrades to the icon fallback
 * rather than breaking anything, because <img> fires onerror and the PDF iframe simply
 * fails to embed.
 */
function fileKind(rule) {
  const name = String(rule.file_name || "");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (IMAGE_EXT.includes(ext)) {
    return { kind: "image", label: ext.toUpperCase(), color: "#7b1fa2", Icon: MdImage };
  }
  if (ext === "pdf") {
    return { kind: "pdf", label: "PDF", color: "#e5534b", Icon: MdPictureAsPdf };
  }
  if (!rule.has_file) {
    return { kind: "none", label: "No file", color: "#8aa", Icon: MdInsertDriveFile };
  }
  return { kind: "file", label: ext.toUpperCase() || "FILE", color: "#8aa", Icon: MdInsertDriveFile };
}

/**
 * Fetches one file as an object URL and revokes it when it is no longer needed.
 *
 * This is the single place that touches createObjectURL. Centralising it means the four
 * ways a blob can go stale -- the rule changed, the panel closed, the component
 * unmounted, the fetch was aborted -- are all handled by one cleanup instead of by
 * whoever remembered.
 *
 * @param key  stable identity; a change aborts the in-flight request and revokes the
 *             previous URL, so no stale image can flash after the rule changes.
 * @param null `id` means "nothing to load" and resolves to null without touching network.
 */
function useObjectUrl(id) {
  // The result is stamped with the id it belongs to, and "loading" is DERIVED from that
  // stamp rather than written as state. Calling setState synchronously inside the effect
  // is a cascading render -- and it would also flash the previous rule's image for a frame
  // before the new one lands.
  const [result, setResult] = useState({ key: null, url: null, failed: false });
  const urlRef = useRef(null);

  useEffect(() => {
    if (!id) return undefined;

    const controller = new AbortController();
    let alive = true;

    api
      .fetchSafetyRuleFileUrl(id, controller.signal)
      .then((url) => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        if (alive) setResult({ key: id, url, failed: false });
      })
      .catch((err) => {
        if (err.name === "AbortError" || !alive) return;
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
        setResult({ key: id, url: null, failed: true });
      });

    return () => {
      alive = false;
      controller.abort();
      // Release the blob the moment it stops being the displayed one -- when the rule
      // changes, or the panel closes. Waiting for the next successful fetch to do it
      // would keep every skipped blob pinned for the life of the tab.
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [id]);

  if (!id) return { url: null, loading: false, failed: false };
  if (result.key !== id) return { url: null, loading: true, failed: false };
  return { url: result.url, loading: false, failed: result.failed };
}

export default function SafetyRulesTab() {
  const { userProfile, role } = useAuth();
  const isAdmin = role === "admin";
  const isSuper = userProfile?.adminLevel === "super";

  // Students carry `course` on their Firestore document; admins carry `courseId` and have
  // NO `course` field at all. Reading only `course` showed an em dash for every admin,
  // which is the same class of bug as trusting one field name across both roles.
  const myCourse = String(userProfile?.course || userProfile?.courseId || "");

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const fileInputRef = useRef(null);

  // Thumbnails for the visible grid, fetched once each and shared with the detail panel.
  // Keyed by rule id so a card never re-downloads when the list re-renders.
  const [thumbs, setThumbs] = useState({});
  const thumbsRef = useRef({});
  const thumbAbort = useRef(null);

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
      [r.title, r.description, r.category, r.course, r.lab_room, r.file_name].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }, [rules, search]);

  // Preload thumbnails for the rules actually on screen, once each.
  //
  // Skipped entirely for non-images: a PDF cannot be shown as a card thumbnail, so
  // fetching it would spend a round trip and a blob to render an icon anyway.
  useEffect(() => {
    const controller = new AbortController();
    thumbAbort.current = controller;

    for (const rule of filtered) {
      if (!rule.has_file || fileKind(rule).kind !== "image") continue;
      if (thumbsRef.current[rule.id]) continue;

      api
        .fetchSafetyRuleFileUrl(rule.id, controller.signal)
        .then((url) => {
          // A card may have scrolled out of `filtered` while this was in flight; its blob
          // would then never be rendered and never revoked.
          thumbsRef.current[rule.id] = url;
          setThumbs((prev) => (prev[rule.id] ? prev : { ...prev, [rule.id]: url }));
        })
        .catch(() => {});
    }

    return () => controller.abort();
  }, [filtered]);

  // Release every thumbnail blob when the tab goes away.
  useEffect(
    () => () => {
      Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u));
      thumbsRef.current = {};
      if (thumbAbort.current) thumbAbort.current.abort();
    },
    [],
  );

  const openAdd = () => {
    setEditing(null);
    // A Course Admin starts pre-filled with its own course and cannot change it; a Super
    // Admin chooses. The server enforces this either way.
    setForm({ ...EMPTY_FORM, course: isSuper ? "" : myCourse });
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setSelected(null);
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
      setSelected(null);
      if (thumbsRef.current[target.id]) {
        URL.revokeObjectURL(thumbsRef.current[target.id]);
        delete thumbsRef.current[target.id];
        setThumbs((prev) => {
          const next = { ...prev };
          delete next[target.id];
          return next;
        });
      }
      await load();
    } catch (err) {
      toast.error(err.message || "Could not delete the safety rule");
      setDeleteTarget(null);
    }
  }

  /**
   * Opens the attached file in a new tab.
   *
   * Fetches through the API first, then opens the object URL. window.open() with the raw
   * endpoint would carry no Authorization header and land on a 401 page.
   */
  async function openFile(rule) {
    try {
      const url = await api.fetchSafetyRuleFileUrl(rule.id);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      // The new tab takes its own copy once it loads; releasing ours is safe and keeps
      // the blob from living until the tab closes.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!win) toast("Allow pop-ups for this site to open the file.");
    } catch (err) {
      toast.error(err.message || "Could not open the file");
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
            const k = fileKind(rule);
            const Icon = k.Icon;
            const thumb = thumbs[rule.id];
            return (
              <div className="cx-card manual-card-interactive" key={rule.id}>
                <div
                  className="cx-card-image"
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${rule.title || "safety rule"}`}
                  onClick={() => setSelected(rule)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(rule);
                    }
                  }}
                >
                  {k.kind === "image" && thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      width="200"
                      height="150"
                      decoding="async"
                    />
                  ) : (
                    <div className="cx-card-placeholder">
                      <Icon size={30} style={{ color: k.color }} />
                      <span>{k.label}</span>
                    </div>
                  )}
                  <span className="cx-card-status">
                    <span
                      className={`manual-status-badge ${rule.status === "Archived" ? "archived" : "active"}`}
                    >
                      {rule.status || "Active"}
                    </span>
                  </span>
                </div>

                <div className="cx-card-body">
                  <h3 className="cx-card-title" title={rule.title}>
                    {rule.title || "Untitled"}
                  </h3>

                  {rule.description ? <p className="cx-item-sub">{rule.description}</p> : null}

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
                        onClick={(e) => {
                          e.stopPropagation();
                          openFile(rule);
                        }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(rule);
                          }}
                        >
                          <MdEdit size={15} />
                        </button>
                        <button
                          className="cx-card-btn cx-card-btn--danger"
                          title="Delete"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(rule);
                          }}
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

{/* ---- picture viewer ---- */}
      {selected && (
        <SafetyViewer
          rule={selected}
          // The grid already downloaded this file as a blob, and that blob is the WHOLE
          // file rather than a scaled-down thumbnail. Reusing it shows the picture at full
          // resolution with no second request.
          cachedUrl={thumbs[selected.id]}
          onClose={() => setSelected(null)}
          onOpen={() => openFile(selected)}
        />
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
                    JPG, PNG or PDF, up to 10 MB. Files are opened through the API, so course
                    permissions apply on every view.
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

/**
 * The picture viewer.
 *
 * Shows the file itself and nothing else by default. Details are opt-in behind the
 * toggle, because the reason someone opens a safety sign is to read the sign -- the
 * metadata is there when they want it, not in front of them when they don't.
 *
 * Closing works three ways: the close button, a click on the overlay OUTSIDE the panel,
 * and Escape. The backdrop click is guarded by checking the event target so that a drag
 * which starts on the picture and ends on the scrim does not close it -- on a touch
 * device that gesture is easy to make by accident.
 */
function SafetyViewer({ rule, cachedUrl, onClose, onOpen }) {
  const [showDetails, setShowDetails] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Images reuse the grid's blob when there is one. PDFs and any file not already
  // downloaded fetch their own, revoked by useObjectUrl on close.
  const needsOwnFetch = !cachedUrl;
  const own = useObjectUrl(needsOwnFetch && rule.has_file ? rule.id : null);
  const url = cachedUrl || own.url;
  const kind = fileKind(rule);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Stop the page behind the scroller from scrolling under the viewer on a phone.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus into the dialog so a keyboard user is not left behind on the grid, and
  // so Tab starts cycling inside it rather than walking out into the page.
  useEffect(() => {
    if (closeRef.current) closeRef.current.focus();
  }, []);

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="sr-viewer-overlay" onClick={onBackdrop}>
      <div
        className="sr-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`${rule.title || "Safety rule"} preview`}
        ref={panelRef}
      >
        <div className="sr-viewer-head">
          <h2 className="sr-viewer-title">{rule.title || "Safety rule"}</h2>
          <div className="sr-viewer-head-actions">
            <button
              type="button"
              className="sr-viewer-toggle"
              aria-expanded={showDetails}
              aria-controls="sr-viewer-details"
              onClick={() => setShowDetails((v) => !v)}
            >
              <MdInfoOutline size={16} />
              Details
            </button>
            <button
              type="button"
              className="sr-viewer-close"
              onClick={onClose}
              ref={closeRef}
              aria-label="Close preview"
            >
              <MdClose size={18} />
            </button>
          </div>
        </div>

        <div className="sr-viewer-body">
          {kind.kind === "pdf" ? (
            // Reused, not rewritten: this already handles loading, the Open fallback
            // when an iframe cannot embed the document, and blob revocation.
            <PdfBody rule={rule} cachedUrl={cachedUrl} onOpen={onOpen} />
          ) : kind.kind === "image" ? (
            url ? (
              <img src={url} alt={rule.title || "Safety rule"} />
            ) : (
              <div className="sr-viewer-placeholder">
                <MdImage size={40} style={{ color: kind.color }} />
                <span>{own.failed ? "Preview unavailable" : "Loading preview…"}</span>
                {own.failed ? (
                  <button type="button" className="btn btn-outline" onClick={onOpen}>
                    Open instead
                  </button>
                ) : null}
              </div>
            )
          ) : (
            <div className="sr-viewer-placeholder">
              <MdInsertDriveFile size={40} style={{ color: kind.color }} />
              <span>{rule.has_file ? `${kind.label} — no inline preview` : "No file attached"}</span>
              {rule.has_file ? (
                <button type="button" className="btn btn-outline" onClick={onOpen}>
                  Open file
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Kept mounted and toggled with [hidden] so expanding Details cannot disturb the
            scroll position or image sizing above. */}
        <div className="sr-viewer-details" id="sr-viewer-details" hidden={!showDetails}>
          <dl>
            <dt>Course</dt>
            <dd>{rule.course}</dd>
            {rule.category ? (
              <>
                <dt>Category</dt>
                <dd>{rule.category}</dd>
              </>
            ) : null}
            {rule.lab_room ? (
              <>
                <dt>Laboratory</dt>
                <dd>{rule.lab_room}</dd>
              </>
            ) : null}
            {rule.uploaderName ? (
              <>
                <dt>Uploaded by</dt>
                <dd>{rule.uploaderName}</dd>
              </>
            ) : null}
            {rule.file_name ? (
              <>
                <dt>File</dt>
                <dd>
                  {rule.file_name}
                  {rule.file_size ? ` · ${rule.file_size}` : ""}
                </dd>
              </>
            ) : null}
          </dl>

          {rule.description ? <p className="sr-viewer-desc">{rule.description}</p> : null}

          <div className="sr-viewer-actions">
            <button type="button" className="btn btn-outline" onClick={onOpen}>
              <MdOpenInNew size={14} /> Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * PDF body for the viewer.
 *
 * A thin wrapper over the existing DetailPdfPreview so the loading state, the
 * "Open instead" fallback for a browser that refuses to embed the PDF, and the blob
 * revocation all live in exactly one place. `cachedUrl` short-circuits the fetch when
 * the grid already holds the document.
 */
function PdfBody({ rule, cachedUrl, onOpen }) {
  if (cachedUrl) {
    return (
      <iframe
        title={`Preview of ${rule.title || "safety rule"}`}
        src={cachedUrl}
        style={{ width: "100%", height: "72vh", border: 0 }}
      />
    );
  }
  return <DetailPdfPreview rule={rule} onOpen={onOpen} />;
}

/**
 * Inline PDF preview.
 *
 * The iframe needs a URL, and the endpoint needs an Authorization header that an iframe
 * cannot send -- so it fetches the authenticated blob and renders a local object URL. A
 * `src` pointing straight at the API would load a 401 into the frame.
 */
function DetailPdfPreview({ rule, onOpen }) {
  const { url, loading, failed } = useObjectUrl(rule.has_file ? rule.id : null);

  if (loading) {
    return (
      <div className="cx-card-placeholder">
        <MdPictureAsPdf size={30} style={{ color: "#e5534b" }} />
        <span>Loading preview…</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="cx-card-placeholder">
        <MdPictureAsPdf size={30} style={{ color: "#e5534b" }} />
        <span>Preview unavailable</span>
        <button className="btn btn-outline" onClick={onOpen}>
          Open instead
        </button>
      </div>
    );
  }

  return (
    <iframe
      title={`Preview of ${rule.title || "safety rule"}`}
      src={url}
      className="manual-pdf-frame"
    />
  );
}