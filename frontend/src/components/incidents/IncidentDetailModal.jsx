import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useIncident, useActiveAdmins } from "../../hooks/useQueries";
import { useAuth } from "../../context/AuthContext";
import { validateIncidentTransition } from "../../utils/incidentValidation";
import IncidentTimeline from "./IncidentTimeline";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TRANSITIONS,
  INCIDENT_TRANSITION_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_COLORS,
  SEVERITY_OPTIONS,
} from "../../constants/incidents";
import { fmtDate, timeAgo } from "../../utils/helpers";
import {
  MdCameraAlt,
  MdCheckCircle,
  MdClose,
  MdInfo,
  MdOutlineWarning,
  MdPerson,
  MdAssignment,
  MdSchedule,
  MdSwapHoriz,
  MdSend,
  MdDelete,
} from "react-icons/md";
import toast from "react-hot-toast";

/** Supabase rows arrive camelCased *and* snake_cased (see transformKeys). */
function read(row, camel, snake) {
  return row?.[camel] ?? row?.[snake] ?? null;
}

function severityLabel(value) {
  return SEVERITY_OPTIONS.find((s) => s.value === value)?.label || value;
}

const ACTION_TONE = {
  under_review: "btn-outline",
  approved: "btn-primary",
  rejected: "btn-danger",
  resolved: "btn-primary",
};

/**
 * One report, read-only for the reporter and reviewable for the course handler.
 *
 * Shared by the admin work queue and the student tracking view so both roles
 * read the same facts in the same order. The list payload has no events, so the
 * timeline comes from GET /incidents/:id via useIncident.
 */
export default function IncidentDetailModal({ incidentId, onClose, onChanged }) {
  const { role, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useIncident(incidentId);
  const { data: adminsData } = useActiveAdmins();

  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [busy, setBusy] = useState(null);
  const [showReassign, setShowReassign] = useState(false);
  const [newHandlerId, setNewHandlerId] = useState("");
  const [imageOverlay, setImageOverlay] = useState(null);

  // Clear per-report state when the modal switches to a different report. Done
  // during render rather than in an effect (the "adjust state when props
  // change" pattern) so opening a report never fires a cascading render, and it
  // matches the render-phase reset used by the list tabs.
  const [prevIncidentId, setPrevIncidentId] = useState(incidentId);
  if (incidentId !== prevIncidentId) {
    setPrevIncidentId(incidentId);
    setNote("");
    setNoteError("");
    setShowReassign(false);
    setNewHandlerId("");
    setBusy(null);
    setImageOverlay(null);
  }

  const incident = data?.data && !Array.isArray(data) ? data.data : data;
  const events = Array.isArray(incident?.events) ? incident.events : [];
  const status = read(incident, "status", "status");
  const photos = Array.isArray(read(incident, "photos", "photos")) ? incident.photos : [];

  const admins = useMemo(() => (Array.isArray(adminsData) ? adminsData : []), [adminsData]);

  // Mirrors isSuperAdmin() in backend/src/utils/adminScope.js, used only to decide
  // whether to offer Delete. The server re-checks it either way.
  const isSuperAdmin = useMemo(() => {
    const courses = userProfile?.assignedCourses?.length
      ? userProfile.assignedCourses
      : userProfile?.assignedCourse
        ? [userProfile.assignedCourse]
        : [];
    return role === "admin" && courses.length === 0;
  }, [role, userProfile]);

  const nextStatuses = useMemo(() => INCIDENT_TRANSITIONS[status] || [], [status]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["incidents"] });
    queryClient.invalidateQueries({ queryKey: ["myIncidents"] });
    queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    onChanged?.();
  }

  async function runTransition(target) {
    // Only a rejection blocks on a reason; everything else may go out bare.
    const problem = validateIncidentTransition(target, note);
    if (problem) {
      setNoteError(problem);
      return;
    }
    setNoteError("");
    setBusy(target);
    try {
      await api.updateIncidentStatus(incidentId, target, note.trim());
      toast.success(`Report marked ${INCIDENT_STATUS_LABELS[target]}`);
      setNote("");
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  async function runRemark() {
    if (!note.trim()) {
      setNoteError("Remark cannot be empty");
      return;
    }
    setNoteError("");
    setBusy("remark");
    try {
      await api.addIncidentRemark(incidentId, note.trim());
      toast.success("Remark added");
      setNote("");
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Failed to add remark");
    } finally {
      setBusy(null);
    }
  }

  async function runReassign() {
    if (!newHandlerId) {
      toast.error("Select a handler");
      return;
    }
    setBusy("reassign");
    try {
      await api.reassignIncident(incidentId, newHandlerId, note.trim());
      toast.success("Report reassigned");
      setShowReassign(false);
      setNewHandlerId("");
      setNote("");
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Failed to reassign");
    } finally {
      setBusy(null);
    }
  }

  async function runDelete() {
    if (!confirm("Delete this incident report? This cannot be undone.")) return;
    setBusy("delete");
    try {
      await api.deleteIncident(incidentId);
      toast.success("Report deleted");
      invalidate();
      onClose();
    } catch (err) {
      toast.error(err?.message || "Failed to delete");
    } finally {
      setBusy(null);
    }
  }

  const canReview = role === "admin" && status !== "resolved";
  const resolution = read(incident, "resolution", "resolution");

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content incident-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="lab-slide-accent" />
          <div className="lab-slide-header">
            <h2>{read(incident, "title", "title") || "Incident Report"}</h2>
            <button type="button" className="lab-slide-close" onClick={onClose} aria-label="Close">
              <MdClose size={20} />
            </button>
          </div>

          <div className="lab-slide-body">
            {isLoading && <div className="incident-detail-loading">Loading report...</div>}

            {!isLoading && incident && (
              <>
                <div className="incident-detail-badges">
                  <span
                    className="badge"
                    style={{
                      background: `${SEVERITY_COLORS[status ? read(incident, "severity", "severity") : "medium"] || "#666"}20`,
                      color: SEVERITY_COLORS[read(incident, "severity", "severity")] || "#666",
                    }}
                  >
                    {severityLabel(read(incident, "severity", "severity"))} severity
                  </span>
                  <span className={`badge incident-status-badge status-${status}`}>
                    {INCIDENT_STATUS_LABELS[status] || status}
                  </span>
                </div>

                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon inc-classification">
                      <MdInfo size={14} />
                    </div>
                    <span className="lab-form-section-title">Report</span>
                  </div>
                  <div className="incident-detail-info">
                    <div className="incident-info-row">
                      <span className="incident-info-label">Item</span>
                      <span className="incident-info-value">
                        {read(incident, "itemName", "item_name") || "-"}
                      </span>
                    </div>
                    <div className="incident-info-row">
                      <span className="incident-info-label">What happened</span>
                      <span className="incident-info-value">
                        {INCIDENT_TYPE_LABELS[read(incident, "type", "type")] || read(incident, "type", "type")}
                      </span>
                    </div>
                    <div className="incident-info-row">
                      <span className="incident-info-label">When</span>
                      <span className="incident-info-value">
                        {fmtDate(read(incident, "incidentDate", "incident_date"))}
                        <small className="incident-info-sub">
                          filed {timeAgo(read(incident, "createdAt", "created_at"))}
                        </small>
                      </span>
                    </div>
                    <div className="incident-info-row">
                      <span className="incident-info-label">Reported by</span>
                      <span className="incident-info-value">
                        {read(incident, "reporterName", "reporter_name")}
                        {read(incident, "reporterSchoolId", "reporter_school_id") && (
                          <small className="incident-info-sub">
                            {read(incident, "reporterSchoolId", "reporter_school_id")}
                          </small>
                        )}
                      </span>
                    </div>
                    <div className="incident-info-row">
                      <span className="incident-info-label">Course</span>
                      <span className="incident-info-value">
                        {read(incident, "reporterCourse", "reporter_course") || "-"}
                        {/* The two courses can differ: a student in one course
                            damaging another course's equipment. */}
                        {read(incident, "itemCourse", "item_course")
                          && read(incident, "itemCourse", "item_course") !== read(incident, "reporterCourse", "reporter_course") && (
                          <small className="incident-info-sub warn">
                            item belongs to {read(incident, "itemCourse", "item_course")}
                          </small>
                        )}
                      </span>
                    </div>
                    <div className="incident-info-row">
                      <span className="incident-info-label">Handled by</span>
                      <span className="incident-info-value">
                        {read(incident, "assignedToName", "assigned_to_name") || (
                          <span className="incident-unassigned">Unassigned</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon inc-description">
                      <MdInfo size={14} />
                    </div>
                    <span className="lab-form-section-title">Description</span>
                  </div>
                  <div className="incident-detail-desc">
                    <p>{read(incident, "description", "description")}</p>
                  </div>
                </div>

                {photos.length > 0 && (
                  <div className="lab-form-section">
                    <div className="lab-form-section-header">
                      <div className="lab-form-section-icon inc-evidence">
                        <MdCameraAlt size={14} />
                      </div>
                      <span className="lab-form-section-title">Evidence ({photos.length})</span>
                    </div>
                    <div className="incident-detail-photos">
                      <div className="incident-photos-grid">
                        {photos.map((url, i) => (
                          <img
                            key={url || i}
                            src={url}
                            alt={`Evidence ${i + 1}`}
                            loading="lazy"
                            onClick={() => setImageOverlay(url)}
                            style={{ cursor: "pointer" }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {resolution && (
                  <div className="lab-form-section">
                    <div className="lab-form-section-header">
                      <div className="lab-form-section-icon inc-resolved">
                        <MdCheckCircle size={14} />
                      </div>
                      <span className="lab-form-section-title">Outcome</span>
                    </div>
                    <div className="incident-detail-resolution">
                      <p>{resolution}</p>
                    </div>
                  </div>
                )}

                <div className="lab-form-section">
                  <div className="lab-form-section-header">
                    <div className="lab-form-section-icon inc-actions">
                      <MdSchedule size={14} />
                    </div>
                    <span className="lab-form-section-title">Progress</span>
                  </div>
                  <IncidentTimeline events={events} />
                </div>

                {canReview && (
                  <div className="lab-form-section">
                    <div className="lab-form-section-header">
                      <div className="lab-form-section-icon inc-actions">
                        <MdPerson size={14} />
                      </div>
                      <span className="lab-form-section-title">Review</span>
                    </div>

                    <div className="incident-review-bar">
                      <label htmlFor="incident-review-note" className="incident-resolve-label">
                        Remarks
                        <span className="incident-review-hint">
                          Required to reject. Included with the action you choose.
                        </span>
                      </label>
                      <textarea
                        id="incident-review-note"
                        className={`incident-resolution-textarea${noteError ? " lab-form-field--invalid" : ""}`}
                        rows={3}
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          if (noteError) setNoteError("");
                        }}
                        placeholder="e.g. Confirmed the damage; replacement requested from the supplier."
                      />
                      {noteError && <span className="lab-field-error">{noteError}</span>}

                      <div className="incident-review-actions">
                        {nextStatuses.map((target) => (
                          <button
                            key={target}
                            type="button"
                            className={`btn ${ACTION_TONE[target] || "btn-outline"} incident-action-btn`}
                            onClick={() => runTransition(target)}
                            disabled={Boolean(busy)}
                          >
                            {target === "approved" && <MdCheckCircle size={14} />}
                            {target === "rejected" && <MdClose size={14} />}
                            {target === "resolved" && <MdCheckCircle size={14} />}
                            {target === "under_review" && <MdOutlineWarning size={14} />}
                            {busy === target ? "Working..." : INCIDENT_TRANSITION_LABELS[target] || target}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="btn btn-outline incident-action-btn"
                          onClick={runRemark}
                          disabled={Boolean(busy)}
                        >
                          <MdSend size={14} /> {busy === "remark" ? "Posting..." : "Add remark only"}
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline incident-action-btn"
                          onClick={() => setShowReassign((v) => !v)}
                          disabled={Boolean(busy)}
                        >
                          <MdSwapHoriz size={14} /> Reassign
                        </button>

                        {isSuperAdmin && status === "pending" && (
                          <button
                            type="button"
                            className="btn btn-danger incident-action-btn"
                            onClick={runDelete}
                            disabled={Boolean(busy)}
                          >
                            <MdDelete size={14} /> Delete
                          </button>
                        )}
                      </div>

                      {showReassign && (
                        <div className="incident-reassign-box">
                          <div className="lab-form-field">
                            <label htmlFor="incident-new-handler">
                              Assign to <span className="lab-required" />
                            </label>
                            <div className="lab-input-wrap">
                              <select
                                id="incident-new-handler"
                                value={newHandlerId}
                                onChange={(e) => setNewHandlerId(e.target.value)}
                              >
                                <option value="">Select a course handler...</option>
                                {admins.map((admin) => {
                                  const courses = admin.assignedCourses?.length
                                    ? admin.assignedCourses
                                    : admin.assignedCourse
                                      ? [admin.assignedCourse]
                                      : [];
                                  return (
                                    <option key={admin.id} value={admin.id}>
                                      {[admin.firstName, admin.lastName].filter(Boolean).join(" ")}
                                      {courses.length ? ` (${courses.join(", ")})` : " (all courses)"}
                                    </option>
                                  );
                                })}
                              </select>
                              <MdAssignment size={16} />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary incident-action-btn"
                            onClick={runReassign}
                            disabled={!newHandlerId || Boolean(busy)}
                          >
                            <MdSwapHoriz size={14} /> {busy === "reassign" ? "Reassigning..." : "Confirm reassignment"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {status === "resolved" && role !== "admin" && (
                  <div className="lab-form-section">
                    <div className="incident-closed-note">
                      This report is closed. If the item was damaged further or you disagree with the outcome, speak to
                      your course handler in person.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="lab-form-actions">
            <button type="button" className="lab-form-cancel-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {imageOverlay && (
        <div className="incident-image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="incident-image-overlay-content">
            <img src={imageOverlay} alt="Full view" />
            <button className="btn-close" onClick={() => setImageOverlay(null)} aria-label="Close image">
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
}