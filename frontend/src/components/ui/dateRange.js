export const RANGE_PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "365d", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
];

export const DEFAULT_RANGE = { preset: "30d", from: "", to: "" };

/**
 * Calendar date (YYYY-MM-DD) in the browser's timezone. The backend reads these
 * as local calendar dates too, so a range never ends "yesterday" overnight.
 */
export function localDayKey(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Converts a range selection into /reports/summary query params.
 * Returns null when no filtering is needed (all time).
 * `today` is passed in so the caller can recompute once the calendar day rolls over.
 */
export function rangeToParams(range, today = new Date()) {
  if (range.preset === "custom") {
    const params = {};
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    return Object.keys(params).length ? params : null;
  }
  const preset = RANGE_PRESETS.find((p) => p.key === range.preset);
  if (!preset?.days) return null;
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (preset.days - 1));
  return { from: localDayKey(start), to: localDayKey(end) };
}
