// Shared catalog vocabularies. These mirror backend/src/middleware/validate.js
// (catalogCreateSchema) and backend/src/controllers/catalogController.js so the
// dropdowns can never offer a value the API would reject.
export const CATALOG_CATEGORIES = ["Tools", "Equipment"];

export const CATALOG_CONDITIONS = [
  "Excellent",
  "Good",
  "Fair",
  "Damaged",
  "For Repair",
  "Missing",
];

export const CATALOG_STATUSES = ["Available", "Borrowed"];

export const CATALOG_SORTS = [
  { value: "name", label: "Name (A-Z)" },
  { value: "date", label: "Newest first" },
  { value: "number", label: "Numeric order" },
];

export const CATALOG_COURSE_UNASSIGNED = "Unassigned";

// Sentinel for "no filter". The backend also treats this as a no-op, so it is
// safe (and clearer) to always send it.
export const ALL = "All";

export const CATALOG_PAGE_SIZE = 25;

export const emptyCatalogForm = () => ({
  itemName: "",
  category: "",
  course: "",
  quantity: "",
  condition: "",
  status: "Available",
  imageUrl: "",
  barcode: "",
  assetTag: "",
});