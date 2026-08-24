export function sanitizeSearchInput(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function matchesSearch(query, ...fields) {
  const q = sanitizeSearchInput(query);
  if (!q) return true;
  return fields.some((f) => String(f || "").toLowerCase().includes(q));
}

export function filterBySearch(items, query, fieldNames) {
  if (!query) return items;
  const q = sanitizeSearchInput(query);
  if (!q) return items;
  return items.filter((item) =>
    fieldNames.some((field) => String(item[field] || "").toLowerCase().includes(q))
  );
}
