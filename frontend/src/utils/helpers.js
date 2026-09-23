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

export function readScanPayload(raw, pattern) {
  const match = String(raw || "").trim().match(new RegExp(`^SLSU-(?:${pattern})\\s*:(.+)$`, "i"));
  return { raw: String(raw || "").trim(), payload: match?.[1]?.trim() || String(raw || "").trim() };
}

export function canUseAsDocId(v) {
  return Boolean(v && !String(v).includes("/"));
}

export function timeAgo(date) {
  const d = toDate(date);
  if (!d) return "";
  const now = new Date();
  const seconds = Math.floor((now - d) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function parseFutureDate(dueDateStr) {
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
    throw new Error("Choose a future due date");
  }
  return due;
}

export function computeTransactionStats(borrowed, returned) {
  const dueSoon = borrowed.filter((b) => {
    if (!b.dueDate) return false;
    const due = toDate(b.dueDate);
    if (!due) return false;
    const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= 3;
  }).length;
  return {
    totalBorrowed: borrowed.length,
    totalReturned: returned.length,
    active: borrowed.filter((b) => getRemainingQuantity(b) > 0).length,
    thisWeek: borrowed.filter((b) => {
      const d = toDate(b.timestamp);
      if (!d) return false;
      return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length,
    dueSoon,
  };
}
