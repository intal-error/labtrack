/**
 * Incident report vocabulary. Kept out of the tab component so that file only
 * exports components (react-refresh only-export-components), and kept in step
 * with backend/src/controllers/incidentController.js -> INCIDENT_TRANSITIONS.
 *
 * Workflow:
 *   pending ──> under_review ──> approved ──> resolved
 *      │             │                              ▲
 *      └──> rejected ┘  (rejected ──> under_review, reopened)
 *      └──> resolved
 */

export const INCIDENT_STATUS = {
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  RESOLVED: "resolved",
};

/** Display order is also the workflow order, so the stepper reads top to bottom. */
export const INCIDENT_STATUSES = [
  INCIDENT_STATUS.PENDING,
  INCIDENT_STATUS.UNDER_REVIEW,
  INCIDENT_STATUS.APPROVED,
  INCIDENT_STATUS.REJECTED,
  INCIDENT_STATUS.RESOLVED,
];

export const INCIDENT_STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
};

/** Mirrors the incident controller. Illegal transitions must not be offered. */
export const INCIDENT_TRANSITIONS = {
  pending: ["under_review", "rejected", "resolved"],
  under_review: ["approved", "rejected", "resolved"],
  approved: ["resolved"],
  rejected: ["under_review"],
  resolved: [],
};

/** Verbs for the buttons, keyed by target status. */
export const INCIDENT_TRANSITION_LABELS = {
  under_review: "Start Review",
  approved: "Approve",
  rejected: "Reject",
  resolved: "Mark Resolved",
};

/**
 * .dash-badge tone vocabulary from DashboardPage.jsx, reused so a status looks
 * the same in the list, the timeline and the dashboard.
 */
export const INCIDENT_STATUS_TONE = {
  pending: "pending",
  under_review: "in-progress",
  approved: "available",
  rejected: "overdue",
  resolved: "resolved",
};

export const OPEN_INCIDENT_STATUSES = [INCIDENT_STATUS.PENDING, INCIDENT_STATUS.UNDER_REVIEW];

export const INCIDENT_STATUS_FILTERS = ["all", ...INCIDENT_STATUSES];

export const INCIDENT_TYPE_OPTIONS = [
  { value: "damage", label: "Damaged the item" },
  { value: "lost", label: "Lost the item" },
  { value: "malfunction", label: "Item stopped working" },
  { value: "other", label: "Other" },
];

/**
 * accident and irregularity are the pre-workflow types. They are kept here only
 * so historical rows still render a readable label; they are not offered on the
 * report form, which only lets a student pick what happened to their item.
 */
export const INCIDENT_TYPE_LABELS = {
  damage: "Damaged item",
  lost: "Lost item",
  malfunction: "Item malfunctioned",
  other: "Other",
  accident: "Accident",
  irregularity: "Irregularity",
};

export const INCIDENT_TYPE_OPTIONS_LEGACY_NOTE =
  "accident/irregularity predate this workflow and are display-only";

export const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "#43A047" },
  { value: "medium", label: "Medium", color: "#f57c00" },
  { value: "high", label: "High", color: "#d32f2f" },
  { value: "critical", label: "Critical", color: "#b71c1c" },
];

export const SEVERITY_COLORS = {
  low: "#43A047",
  medium: "#f57c00",
  high: "#d32f2f",
  critical: "#b71c1c",
};

export const SEVERITY_FILTERS = ["all", ...SEVERITY_OPTIONS.map((s) => s.value)];

export const MAX_INCIDENT_PHOTOS = 3;
export const MIN_DESCRIPTION_LENGTH = 20;

/** Reporter cannot pick a date ahead of today. */
export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function emptyIncidentForm() {
  return {
    catalogId: "",
    incidentDate: todayISO(),
    type: INCIDENT_TYPE_OPTIONS[0].value,
    severity: "medium",
    description: "",
    photos: [],
  };
}