import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MdClose, MdEdit, MdInfo, MdImage, MdAssignment, MdTag, MdQrCode, MdCloudUpload } from "react-icons/md";
import { COURSES } from "../../constants/courses";
import { CATALOG_CATEGORIES, CATALOG_CONDITIONS, CATALOG_STATUSES, emptyCatalogForm } from "../../constants/catalog";
import { validateCatalogForm, validateCatalogUpdate, hasErrors } from "../../utils/catalogValidation";
import { api } from "../../services/api";
import toast from "react-hot-toast";

function Field({ label, required, error, children }) {
  return (
    <div className={`lab-form-field${error ? " lab-form-field--invalid" : ""}`}>
      <label>
        {label} {required && <span className="lab-required" />}
      </label>
      {children}
      {error && <span className="lab-field-error">{error}</span>}
    </div>
  );
}

/**
 * Must match the multer config in backend/src/controllers/uploadController.js.
 *
 * WHY check this here instead of trusting the file picker: `accept` is advisory
 * only — it shapes the OS dialog and is trivially bypassed by "All files", by
 * drag-and-drop, or by pasting an extension. The picker used to say
 * `image/*` while the server accepted only these three types, so the UI
 * cheerfully offered webp and HEIC (both very likely from a phone, and this app
 * is an installable PWA) and then rejected the upload. Combined with an error
 * message that named nothing, the result was an item that simply could not be
 * created. Rejecting up front turns that into a sentence that says what to do.
 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

function toPayload(form) {
  return {
    itemName: form.itemName.trim(),
    category: form.category,
    course: form.course,
    quantity: Number(form.quantity),
    condition: form.condition,
    status: form.status || "Available",
    imageUrl: form.imageUrl.trim(),
    barcode: form.barcode.trim(),
    assetTag: form.assetTag.trim(),
  };
}

/**
 * The create and update drawers were ~110 lines of near-identical JSX each.
 * They are one form with an extra Status field on update, so they are one
 * component now.
 *
 * Validation is per-field and inline (utils/catalogValidation.js mirrors the
 * server's zod schema). The old version had a single
 * `if (!form.itemName || !form.imageUrl)` check, so a quantity of 0 or a
 * fractional quantity only failed later as an opaque 400.
 */
export default function CatalogItemDrawer({ open, mode = "create", initial, onClose }) {
  const isUpdate = mode === "update";
  const queryClient = useQueryClient();

  const blankForm = () =>
    isUpdate
      ? {
          itemName: initial?.itemName ?? "",
          category: initial?.category ?? "",
          course: initial?.course ?? "",
          quantity: initial?.quantity ?? "",
          condition: initial?.condition ?? "",
          status: initial?.status ?? "Available",
          imageUrl: initial?.imageUrl ?? "",
          barcode: initial?.barcode ?? "",
          assetTag: initial?.assetTag ?? "",
        }
      : emptyCatalogForm();

  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  // The panel has to stay mounted while it is closed or the .35s slide
  // transition never runs (an element inserted already carrying .open is just
  // painted in place). So the form cannot rely on mounting to reset itself —
  // re-seed it whenever the drawer opens or the edited item changes.
  const [seed, setSeed] = useState({ open, id: initial?.id });
  if (seed.open !== open || seed.id !== initial?.id) {
    setSeed({ open, id: initial?.id });
    setForm(blankForm());
    setErrors({});
  }

  // The server refuses to drop quantity below what is currently on loan, and
  // only the server knows that number. Surfacing it here saves a round trip.
  const borrowedCount = isUpdate
    ? Math.max(0, Number(initial?.quantity || 0) - Number(initial?.availableQuantity || 0))
    : 0;

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Rejected locally rather than uploaded and bounced, so the user is told
      // what is wrong with the file instead of being told "upload failed".
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error("Only JPG, PNG, and GIF images are allowed");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("Image must be 10MB or smaller");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      setUploading(true);
      try {
        const { url } = await api.uploadImage(file);
        setForm((f) => ({ ...f, imageUrl: url }));
        setErrors((prev) => ({ ...prev, imageUrl: undefined }));
        toast.success("Photo uploaded!");
      } catch (err) {
        toast.error(err?.message || "Upload failed");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = isUpdate ? validateCatalogUpdate(form, borrowedCount) : validateCatalogForm(form);
    if (hasErrors(found)) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (isUpdate) {
        await api.updateCatalogItem(initial.id, toPayload(form));
        toast.success("Item updated!");
      } else {
        await api.createCatalogItem(toPayload(form));
        toast.success("Item created!");
      }
      // ["catalog"] is a prefix of ["catalog", "stats"] too, so the KPI tiles
      // refresh alongside the list.
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      handleClose();
    } catch (err) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  return (
    <>
      <div className={`lab-slide-panel ${open ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{isUpdate ? "Update Item" : "Create Item"}</h2>
          <button className="lab-slide-close" type="button" onClick={handleClose} aria-label="Close">
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          {open && (
            <>
              <div className="lab-slide-accent" />
              <form onSubmit={handleSubmit} noValidate>
                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon details">
                      <MdAssignment size={14} />
                    </div>
                    <span className="lab-form-section-title">Item Info</span>
                  </div>
                  <div className="lab-form-row">
                    <Field label="Item Name" required error={errors.itemName}>
                      <div className="lab-input-wrap">
                        <input type="text" value={form.itemName} onChange={set("itemName")} placeholder="e.g. Oscilloscope" />
                        <MdEdit size={16} />
                      </div>
                    </Field>
                    <Field label="Category" required error={errors.category}>
                      <div className="lab-input-wrap">
                        <select value={form.category} onChange={set("category")}>
                          <option value="">Select Category</option>
                          {CATALOG_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <MdInfo size={16} />
                      </div>
                    </Field>
                  </div>
                  <Field label="Course" required error={errors.course}>
                    <div className="lab-input-wrap">
                      <select value={form.course} onChange={set("course")}>
                        <option value="">Select Course</option>
                        {COURSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <MdAssignment size={16} />
                    </div>
                  </Field>
                </div>

                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon schedule">
                      <MdTag size={14} />
                    </div>
                    <span className="lab-form-section-title">Details</span>
                  </div>
                  <div className="lab-form-row">
                    <Field label="Quantity" required error={errors.quantity}>
                      <div className="lab-input-wrap">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={borrowedCount || 1}
                          step="1"
                          max="10000"
                          value={form.quantity}
                          onChange={set("quantity")}
                          placeholder="1"
                        />
                        <MdTag size={16} />
                      </div>
                    </Field>
                    <Field label="Condition" required error={errors.condition}>
                      <div className="lab-input-wrap">
                        <select value={form.condition} onChange={set("condition")}>
                          <option value="">Select Condition</option>
                          {CATALOG_CONDITIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <MdInfo size={16} />
                      </div>
                    </Field>
                  </div>
                  {isUpdate && (
                    <Field label="Status" error={errors.status}>
                      <div className="lab-input-wrap">
                        <select value={form.status} onChange={set("status")}>
                          {CATALOG_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <MdInfo size={16} />
                      </div>
                    </Field>
                  )}
                  <div className="lab-form-row">
                    <Field label="Barcode" error={errors.barcode}>
                      <div className="lab-input-wrap">
                        <input type="text" value={form.barcode} onChange={set("barcode")} placeholder="Optional" />
                        <MdQrCode size={16} />
                      </div>
                    </Field>
                    <Field label="Asset Tag" error={errors.assetTag}>
                      <div className="lab-input-wrap">
                        <input type="text" value={form.assetTag} onChange={set("assetTag")} placeholder="Optional" />
                        <MdTag size={16} />
                      </div>
                    </Field>
                  </div>
                </div>

                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon class">
                      <MdImage size={14} />
                    </div>
                    <span className="lab-form-section-title">Photo</span>
                  </div>
                  <Field label="Photo" required error={errors.imageUrl}>
                    <div className="lab-image-row">
                      <div className="lab-input-wrap">
                        <input type="url" value={form.imageUrl} onChange={set("imageUrl")} placeholder="Upload a photo or paste a link" />
                        <MdImage size={16} />
                      </div>
                      <button type="button" className="lab-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        <MdCloudUpload size={16} />
                        {uploading ? "Uploading..." : "Upload"}
                      </button>
                      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} onChange={handleUpload} hidden />
                    </div>
                    {isUpdate && form.imageUrl && (
                      <img className="lab-image-preview" src={form.imageUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                  </Field>
                </div>

                <div className="lab-form-actions">
                  <button type="button" className="lab-form-cancel-btn" onClick={handleClose} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" className="lab-form-submit-btn" disabled={submitting || uploading}>
                    {submitting ? "Saving..." : isUpdate ? "Update Item" : "Create Item"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      {open && <div className="lab-slide-backdrop" onClick={handleClose} />}
    </>
  );
}