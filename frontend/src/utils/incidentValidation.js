import {
  INCIDENT_TYPE_OPTIONS,
  SEVERITY_OPTIONS,
  MAX_INCIDENT_PHOTOS,
  MIN_DESCRIPTION_LENGTH,
  todayISO,
} from "../constants/incidents";

/**
 * Client-side mirror of backend/src/middleware/validate.js -> incidentCreateSchema.
 * Returns a map of field -> message; an empty object means the form is valid.
 *
 * The previous incident form relied only on the `required` attribute, so a
 * three-word description or a future date passed the browser and came back as
 * an opaque 400. Errors are attached per field (see the .lab-form-field--invalid
 * contract in shared-form-panel.css) instead of surfacing only as a toast.
 */
export function validateIncidentForm(form) {
  const errors = {};

  if (!String(form?.catalogId ?? "").trim()) {
    errors.catalogId = "Select the item involved";
  }

  const incidentDate = String(form?.incidentDate ?? "").trim();
  if (!incidentDate) {
    errors.incidentDate = "Date of incident is required";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) {
    errors.incidentDate = "Date must be a calendar date";
  } else if (incidentDate > todayISO()) {
    // Plain YYYY-MM-DD strings compare correctly as strings, which avoids the
    // UTC-midnight parsing trap documented in DashboardPage.jsx toLocalDate.
    errors.incidentDate = "Date cannot be in the future";
  }

  const type = String(form?.type ?? "").trim();
  if (!INCIDENT_TYPE_OPTIONS.some((t) => t.value === type)) {
    errors.type = "Choose what happened to the item";
  }

  const severity = String(form?.severity ?? "").trim();
  if (!SEVERITY_OPTIONS.some((s) => s.value === severity)) {
    errors.severity = "Choose how serious this is";
  }

  const description = String(form?.description ?? "").trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    errors.description = `Describe what happened in at least ${MIN_DESCRIPTION_LENGTH} characters`;
  } else if (description.length > 4000) {
    errors.description = "Description is too long";
  }

  const photos = Array.isArray(form?.photos) ? form.photos : [];
  if (photos.length > MAX_INCIDENT_PHOTOS) {
    errors.photos = `Maximum ${MAX_INCIDENT_PHOTOS} photos`;
  }

  return errors;
}

export function hasErrors(errors) {
  return Boolean(errors) && Object.keys(errors).length > 0;
}

/**
 * A handler rejecting a report has to tell the student why, so the note is
 * mandatory for that one transition only. Mirrors the server guard in
 * incidentController.updateStatus.
 */
export function validateIncidentTransition(status, note) {
  if (status === "rejected" && !String(note ?? "").trim()) {
    return "Please give a reason for rejecting this report";
  }
  return null;
}