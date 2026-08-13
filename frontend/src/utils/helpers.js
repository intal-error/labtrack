export function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function numOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getAvailableQuantity(item) {
  if (Number.isFinite(Number(item?.availableQuantity))) {
    return Math.max(0, numOr(item.availableQuantity));
  }
  const quantity = Math.max(0, numOr(item?.quantity));
  return (item?.status || "").toLowerCase() === "borrowed" ? 0 : quantity;
}

export function getRemainingQuantity(transaction) {
  return Math.max(0, numOr(transaction?.quantity, 1) - numOr(transaction?.returnedQuantity));
}

export function isOpenBorrow(transaction) {
  if (transaction?.action !== "borrowed") return false;
  if ((transaction?.status || "").toLowerCase() === "returned") return false;
  return getRemainingQuantity(transaction) > 0;
}

export function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function formatDate(date) {
  if (!date) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
