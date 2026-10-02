// Borrow-request status vocabulary. Kept out of the table component so that
// file only exports components (react-refresh only-export-components).
export const REQUEST_STATUS_TONE = {
  pending: "warn",
  approved: "ok",
  rejected: "bad",
  cancelled: "muted",
};

export const REQUEST_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const REQUEST_FILTERS = ["all", "pending", "approved", "rejected", "cancelled"];