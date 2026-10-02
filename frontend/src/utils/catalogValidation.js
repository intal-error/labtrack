import { CATALOG_CONDITIONS, CATALOG_STATUSES } from "../constants/catalog";

/**
 * Client-side mirror of backend/src/middleware/validate.js -> catalogCreateSchema.
 * Returns a map of field -> message; an empty object means the form is valid.
 *
 * The old page had a single `if (!form.itemName || !form.imageUrl)`, so a
 * quantity of 0, a fractional quantity or a missing condition only surfaced
 * later as an opaque 400 from the API.
 */
export function validateCatalogForm(form) {
  const errors = {};

  const itemName = String(form?.itemName ?? "").trim();
  if (!itemName) errors.itemName = "Item name is required";
  else if (itemName.length > 200) errors.itemName = "Item name must be 200 characters or fewer";

  if (!String(form?.category ?? "").trim()) {
    errors.category = "Category is required";
  }

  if (!String(form?.course ?? "").trim()) {
    errors.course = "Course is required";
  }

  const rawQty = form?.quantity;
  const qtyText = String(rawQty ?? "").trim();
  if (!qtyText) {
    errors.quantity = "Quantity is required";
  } else {
    const qty = Number(qtyText);
    if (!Number.isFinite(qty)) errors.quantity = "Quantity must be a number";
    else if (!Number.isInteger(qty)) errors.quantity = "Quantity must be a whole number";
    else if (qty < 1) errors.quantity = "Quantity must be at least 1";
    else if (qty > 10000) errors.quantity = "Quantity must be 10000 or fewer";
  }

  const condition = String(form?.condition ?? "").trim();
  if (!condition) errors.condition = "Condition is required";
  else if (!CATALOG_CONDITIONS.includes(condition)) errors.condition = "Pick a listed condition";

  const status = String(form?.status ?? "").trim();
  if (status && !CATALOG_STATUSES.includes(status)) errors.status = "Pick a listed status";

  const imageUrl = String(form?.imageUrl ?? "").trim();
  if (!imageUrl) {
    errors.imageUrl = "A photo is required";
  } else if (imageUrl.length > 500) {
    errors.imageUrl = "Photo URL is too long";
  } else if (!/^https?:\/\/\S+$/i.test(imageUrl)) {
    errors.imageUrl = "Photo must be a valid http(s) URL";
  }

  if (String(form?.barcode ?? "").trim().length > 100) {
    errors.barcode = "Barcode must be 100 characters or fewer";
  }
  if (String(form?.assetTag ?? "").trim().length > 100) {
    errors.assetTag = "Asset tag must be 100 characters or fewer";
  }

  return errors;
}

export function hasErrors(errors) {
  return Boolean(errors) && Object.keys(errors).length > 0;
}

/**
 * Update uses a looser server contract (no zod schema on PUT), but the same
 * client rules apply minus quantity's lower bound: the backend rejects
 * `quantity < currentlyBorrowed` with a message only the server knows, so the
 * page surfaces that via toast and lets the client enforce the rest.
 */
export function validateCatalogUpdate(form, minimumQuantity = 0) {
  const errors = validateCatalogForm(form);
  const qty = Number(String(form?.quantity ?? "").trim());
  if (Number.isInteger(qty) && minimumQuantity > 0 && qty < minimumQuantity) {
    errors.quantity = `Quantity cannot be below ${minimumQuantity} (currently on loan)`;
  }
  return errors;
}