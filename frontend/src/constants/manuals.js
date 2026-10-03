// Lab manual vocabularies, kept out of the component so the filter bar, the
// upload form and any future surface cannot drift apart. Mirrors the shape of
// constants/catalog.js.
import { ALL } from "./catalog";

export { ALL };

// "All" is the sentinel the client-side filters treat as "no filter". The
// manuals list is fetched whole (backend/src/controllers/manualController.js
// getAll is unpaginated), so paging happens here rather than server-side.
export const MANUALS_PAGE_SIZE = 25;

export const MANUAL_CATEGORIES = ["General", "Safety", "Equipment Guide", "Software", "Procedure", "Other"];

export const MANUAL_STATUSES = ["Active", "Archived"];

export const MANUAL_SORTS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
];

// The form's category default must exist in the vocabulary above.
export const DEFAULT_MANUAL_CATEGORY = "General";
export const DEFAULT_MANUAL_STATUS = "Active";