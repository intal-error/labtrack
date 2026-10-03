import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useCatalog } from "../../hooks/useQueries";
import { useAuth } from "../../context/AuthContext";
import { validateIncidentForm, hasErrors } from "../../utils/incidentValidation";
import {
  INCIDENT_TYPE_OPTIONS,
  SEVERITY_OPTIONS,
  MAX_INCIDENT_PHOTOS,
  emptyIncidentForm,
  todayISO,
} from "../../constants/incidents";
import {
  MdWarning,
  MdAdd,
  MdCameraAlt,
  MdClose,
  MdInfo,
  MdOutlineWarning,
  MdInventory,
} from "react-icons/md";
import toast from "react-hot-toast";

/**
 * The student-facing report form, in the shared .lab-slide-panel shell used by
 * the other resource forms.
 *
 * Notes on what changed from the old inline form in IncidentTab:
 *  - the item is REQUIRED (a report about a borrowed item is meaningless without
 *    knowing which one) and the date of the incident is a separate field from
 *    the time it was filed
 *  - errors are per field (.lab-form-field--invalid + .lab-field-error) instead
 *    of a single toast, so a rejected form points at the offending control
 *  - there is no edit path. Previously an admin could PUT any field of a filed
 *    report, including the description, which let a student's own words be
 *    rewritten after the fact.
 */
export default function IncidentReportForm({ open, onClose, onSubmitted }) {
  const { role, userProfile, user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyIncidentForm);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const { data: catalogData } = useCatalog();
  const catalog = useMemo(() => (Array.isArray(catalogData) ? catalogData : []), [catalogData]);

  // Reset whenever the panel is (re)opened so a previous draft never leaks into
  // a new report. Done during render rather than in an effect, which is React's
  // sanctioned way to adjust state on a prop change and avoids an extra render
  // pass on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(emptyIncidentForm());
      setErrors({});
    }
  }

  const selectedItem = useMemo(
    () => catalog.find((c) => c.id === form.catalogId) || null,
    [catalog, form.catalogId]
  );

  // The student's own course decides who handles the report, so show it. Makes
  // the assignment predictable instead of a black box.
  const reporterCourse = userProfile?.course || "";

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  }

  function close() {
    onClose();
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    // Reset the input so choosing the same file twice in a row still fires.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (form.photos.length >= MAX_INCIDENT_PHOTOS) {
      toast.error(`Maximum ${MAX_INCIDENT_PHOTOS} photos`);
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      update({ photos: [...form.photos, url] });
      toast.success("Photo added");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(index) {
    update({ photos: form.photos.filter((_, i) => i !== index) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validateIncidentForm(form);
    setErrors(found);
    if (hasErrors(found)) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSubmitting(true);
    try {
      await api.createIncident({
        catalogId: form.catalogId,
        incidentDate: form.incidentDate,
        type: form.type,
        severity: form.severity,
        description: form.description.trim(),
        photos: form.photos,
      });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["myIncidents"] });
      toast.success(
        reporterCourse
          ? `Report submitted and sent to your ${reporterCourse} course handler`
          : "Report submitted"
      );
      close();
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = (name) => `lab-form-field${errors[name] ? " lab-form-field--invalid" : ""}`;
  const reporterLabel =
    [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ") ||
    user?.displayName ||
    "You";

  return (
    <>
      <div className={`lab-slide-panel ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="lab-slide-header">
          <h2>Report a Damaged or Lost Item</h2>
          <button type="button" className="lab-slide-close" onClick={close} aria-label="Close">
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleSubmit} noValidate>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-details">
                  <MdWarning size={14} />
                </div>
                <span className="lab-form-section-title">What happened</span>
              </div>

              <div className={fieldClass("catalogId")}>
                <label htmlFor="incident-item">
                  Item involved <span className="lab-required" />
                </label>
                <div className="lab-input-wrap">
                  <select
                    id="incident-item"
                    value={form.catalogId}
                    onChange={(e) => update({ catalogId: e.target.value })}
                  >
                    <option value="">Select the item you borrowed</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.itemName}
                        {c.course ? ` — ${c.course}` : ""}
                      </option>
                    ))}
                  </select>
                  <MdInventory size={16} />
                </div>
                {errors.catalogId && <span className="lab-field-error">{errors.catalogId}</span>}
                {selectedItem?.imageUrl && (
                  <div className="incident-selected-item">
                    <img src={selectedItem.imageUrl} alt="" />
                    <span>
                      {selectedItem.category}
                      {selectedItem.condition ? ` · ${selectedItem.condition}` : ""}
                    </span>
                  </div>
                )}
              </div>

              <div className="lab-form-row">
                <div className={fieldClass("type")}>
                  <label htmlFor="incident-type">
                    Type <span className="lab-required" />
                  </label>
                  <div className="lab-input-wrap">
                    <select id="incident-type" value={form.type} onChange={(e) => update({ type: e.target.value })}>
                      {INCIDENT_TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <MdWarning size={16} />
                  </div>
                  {errors.type && <span className="lab-field-error">{errors.type}</span>}
                </div>

                <div className={fieldClass("severity")}>
                  <label htmlFor="incident-severity">
                    How serious <span className="lab-required" />
                  </label>
                  <div className="lab-input-wrap">
                    <select id="incident-severity" value={form.severity} onChange={(e) => update({ severity: e.target.value })}>
                      {SEVERITY_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <MdOutlineWarning size={16} />
                  </div>
                  {errors.severity && <span className="lab-field-error">{errors.severity}</span>}
                </div>
              </div>

              <div className={fieldClass("incidentDate")}>
                <label htmlFor="incident-date">
                  Date it happened <span className="lab-required" />
                </label>
                <div className="lab-input-wrap">
                  <input
                    id="incident-date"
                    type="date"
                    max={todayISO()}
                    value={form.incidentDate}
                    onChange={(e) => update({ incidentDate: e.target.value })}
                  />
                  <MdInfo size={16} />
                </div>
                {errors.incidentDate && <span className="lab-field-error">{errors.incidentDate}</span>}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-description">
                  <MdInfo size={14} />
                </div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className={fieldClass("description")}>
                <label htmlFor="incident-description">
                  Description <span className="lab-required" />
                </label>
                <textarea
                  id="incident-description"
                  rows={5}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Describe what happened, what state the item is in, and anything else your course handler should know."
                />
                {errors.description && <span className="lab-field-error">{errors.description}</span>}
                <span className="incident-char-count">
                  {form.description.trim().length < 20
                    ? `At least 20 characters (${form.description.trim().length} so far)`
                    : `${form.description.trim().length} characters`}
                </span>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-evidence">
                  <MdCameraAlt size={14} />
                </div>
                <span className="lab-form-section-title">Evidence (optional)</span>
              </div>
              <div className={fieldClass("photos")}>
                <div className="incident-photo-upload-area">
                  {form.photos.map((url, i) => (
                    <div className="incident-photo-thumb" key={url || i}>
                      <img src={url} alt={`Evidence ${i + 1}`} />
                      <button type="button" className="incident-photo-remove" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}>
                        <MdClose size={14} />
                      </button>
                    </div>
                  ))}
                  {form.photos.length < MAX_INCIDENT_PHOTOS && (
                    <label className="incident-photo-add">
                      <MdCameraAlt size={18} /> {uploading ? "Uploading..." : "Add photo"}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        hidden
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
                <span className="incident-photo-hint">
                  Up to {MAX_INCIDENT_PHOTOS} photos. A photo of the damage speeds up the review.
                </span>
                {errors.photos && <span className="lab-field-error">{errors.photos}</span>}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon inc-resolved">
                  <MdInfo size={14} />
                </div>
                <span className="lab-form-section-title">Who reviews this</span>
              </div>
              <p className="incident-assignment-note">
                {role === "admin" ? (
                  <>You are filing this as {reporterLabel}. It will be assigned to the course handler for{" "}
                    <strong>{reporterCourse || "your course"}</strong>.</>
                ) : (
                  <>This goes to the course handler for{" "}
                    <strong>{reporterCourse || "your course"}</strong>. You can follow the status and read their
                    remarks at any time.</>
                )}
              </p>
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="lab-form-submit-btn" disabled={submitting || uploading}>
                <MdAdd size={16} /> {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        </div>
      </div>
      {open && <div className="lab-slide-backdrop" onClick={close} />}
    </>
  );
}