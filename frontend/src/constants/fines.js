/*
 * Fine status vocabulary, shared by the FinesTab table and StudentFineCard.
 *
 * Lives here rather than in FinesTab.jsx so the card can import it without a
 * circular dependency (FinesTab renders the card, so importing back into
 * FinesTab would close the loop). Both surfaces must agree: a fine that reads
 * "Unpaid" in the table has to read "Unpaid" on its card, and the raw status
 * key must never leak into student-facing text.
 *
 * These are the three states FinesTab filters on (see the `filter` default of
 * "all" and the maintenance-filter-tabs row).
 */
export const STATUS_LABELS = {
  pending: "Unpaid",
  paid: "Paid",
  waived: "Waived",
};