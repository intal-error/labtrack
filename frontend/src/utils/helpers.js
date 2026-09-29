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

export function fmtDate(date) {
  if (!date) return "-";
  const d = toDate(date);
  if (!d) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(date) {
  if (!date) return "-";
  const d = toDate(date);
  if (!d) return "-";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function conditionClass(value) {
  const v = (value || "").toLowerCase();
  if (v === "excellent") return "cond-excellent";
  if (v === "good") return "cond-good";
  if (v === "fair") return "cond-fair";
  if (v === "damaged") return "cond-damaged";
  if (v === "for repair") return "cond-repair";
  if (v === "missing") return "cond-missing";
  return "";
}

export function getOverdueInfo(dueDate) {
  if (!dueDate) return null;
  const diff = Date.now() - dueDate.getTime();
  if (diff <= 0) return null;
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 1) return { text: "Overdue", className: "overdue-warning" };
  const wholeDays = Math.floor(days);
  return {
    text: `${wholeDays}d overdue`,
    className: days >= 7 ? "overdue-critical" : "overdue-warning",
  };
}

export function sortTransactions(items, sortBy) {
  const [key, dir] = sortBy.split("-");
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === "date") {
      const da = toDate(a.timestamp)?.getTime() || 0;
      const db = toDate(b.timestamp)?.getTime() || 0;
      return (da - db) * mult;
    }
    if (key === "name") {
      const na = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
      const nb = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
      return na.localeCompare(nb) * mult;
    }
    if (key === "qty") return ((a.quantity || 0) - (b.quantity || 0)) * mult;
    return 0;
  });
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
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const AVATAR_COLORS = ["#2E7D32", "#1976d2", "#ef6c00", "#7b1fa2", "#00897b", "#c62828", "#5d4037"];

export function getInitials(...parts) {
  const words = parts.join(" ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function parseFutureDate(dueDateStr) {
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
    throw new Error("Choose a future due date");
  }
  return due;
}

