const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
// Supabase/PostgREST silently caps a response at `max-rows` (1000 by default),
// so every unbounded read must be paged out or the counts come back short. The
// pager lives in utils/fetchAll because the catalog reads need it too.
const { fetchAll } = require("../utils/fetchAll");

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Bare `YYYY-MM-DD` values are calendar dates in the server's local timezone —
// the same convention attendanceController uses when writing lab_attendance.date.
function parseDay(value) {
  if (typeof value !== "string") return new Date(NaN);
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : new Date(NaN);
}

function toMs(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "string" && DATE_RE.test(value)) {
    const t = parseDay(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return dayKey(new Date());
}

function parseDateParam(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const d = parseDay(value);
  if (Number.isNaN(d.getTime()) || dayKey(d) !== value) return null;
  return value;
}

function bucketSizeFor(fromStr, toStr) {
  const days = Math.round((parseDay(toStr).getTime() - parseDay(fromStr).getTime()) / DAY_MS);
  if (days > 400) return "month";
  if (days > 120) return "week";
  return "day";
}

function bucketKeyFor(date, size) {
  if (size === "month") return dayKey(date).slice(0, 7);
  if (size === "week") {
    const backToMonday = (date.getDay() + 6) % 7;
    return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - backToMonday));
  }
  return dayKey(date);
}

function bucketLabelFor(key, size) {
  const [y, m, d = 1] = key.split("-").map(Number);
  if (size === "month") {
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Builds a continuous bucketed timeline (day/week/month) for the selected range.
 * `bump(when, field)` increments a metric on the bucket that contains `when`.
 */
function createSeries(fromStr, toStr, capMs) {
  const size = bucketSizeFor(fromStr, toStr);
  const entries = [];
  const rows = new Map();
  const from = parseDay(fromStr);
  const to = parseDay(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { entries, bump: () => {} };
  }

  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cursor.getTime() <= to.getTime()) {
    const key = bucketKeyFor(cursor, size);
    const next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const bucketEnd = Math.min(next.getTime() - 1, capMs);
    const existing = rows.get(key);
    if (existing) {
      existing.endMs = bucketEnd;
    } else {
      const row = { key, label: bucketLabelFor(key, size), endMs: bucketEnd };
      rows.set(key, row);
      entries.push(row);
    }
    cursor = next;
  }

  const bump = (when, field, amount = 1) => {
    const t = toMs(when);
    if (t === null) return;
    const row = rows.get(bucketKeyFor(new Date(t), size));
    if (row) row[field] = (row[field] || 0) + amount;
  };

  return { entries, bump };
}

/**
 * A borrow only counts as returned once `returned_at` says so. `last_returned_at`
 * is a partial-return timestamp and must not be used: a `partially_returned`
 * record still has units out and can still be overdue.
 * Rows written before `returned_at` existed fall back to their status.
 */
function returnedAsOf(t, ms) {
  const returnedAt = toMs(t.returned_at);
  if (returnedAt !== null) return returnedAt <= ms;
  return (t.status || "").toLowerCase() === "returned";
}

function countOverdueAt(borrowedRows, ms) {
  let count = 0;
  for (const t of borrowedRows) {
    const due = toMs(t.due_date);
    if (due === null || due >= ms) continue;
    if (returnedAsOf(t, ms)) continue;
    count += 1;
  }
  return count;
}

const getSummary = async (req, res) => {
  try {
    const today = todayKey();
    let fromParam = parseDateParam(req.query.from);
    let toParam = parseDateParam(req.query.to);
    if (fromParam && toParam && fromParam > toParam) {
      const swap = fromParam;
      fromParam = toParam;
      toParam = swap;
    }
    const toStr = toParam || today;

    const attendanceRangeQuery = () => {
      let q = supabase.from("lab_attendance").select("date", { count: "exact" }).lte("date", toStr);
      if (fromParam) q = q.gte("date", fromParam);
      return q.order("id", { ascending: true });
    };

    const [
      usersAgg,
      studentsAgg,
      borrowedRows,
      returnedRows,
      incidents,
      attendanceRange,
      roomsAgg,
      activeRoomsAgg,
    ] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("users").where("role", "==", "student").count().get(),
      fetchAll(() =>
        supabase
          .from("transactions")
          .select("*", { count: "exact" })
          .eq("action", "borrowed")
          .order("id", { ascending: true })
      ),
      fetchAll(() =>
        supabase
          .from("transactions")
          .select("*", { count: "exact" })
          .eq("action", "returned")
          .order("id", { ascending: true })
      ),
      fetchAll(() => supabase.from("incidents").select("*", { count: "exact" }).order("id", { ascending: true })),
      fetchAll(attendanceRangeQuery),
      // `head: true` asks PostgREST for the count header only, so the room
      // totals cost nothing regardless of how many labs are registered.
      supabase.from("lab_rooms").select("*", { count: "exact", head: true }),
      supabase
        .from("lab_rooms")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

    // PostgREST reports failures in the resolved value rather than rejecting, so
    // the head-count reads have to be checked by hand. Without this a permission
    // or schema problem would surface as "0 rooms" instead of an error.
    if (roomsAgg?.error) throw roomsAgg.error;
    if (activeRoomsAgg?.error) throw activeRoomsAgg.error;

    // Effective range start: explicit ?from, otherwise earliest data (all-time)
    let fromStr = fromParam;
    if (!fromStr) {
      let minMs = null;
      const consider = (value) => {
        const t = toMs(value);
        if (t !== null && (minMs === null || t < minMs)) minMs = t;
      };
      borrowedRows.forEach((t) => consider(t.borrowed_at || t.timestamp || t.created_at));
      returnedRows.forEach((t) => consider(t.returned_at || t.timestamp || t.created_at));
      (attendanceRange || []).forEach((r) => consider(r.date));
      const to = parseDay(toStr);
      const fallback = minMs === null ? new Date(to.getFullYear(), to.getMonth(), to.getDate() - 90) : new Date(minMs);
      fromStr = dayKey(fallback);
    }
    // A ?from later than the range end would otherwise build an empty series.
    if (fromStr > toStr) fromStr = toStr;

    const fromMs = parseDay(fromStr).getTime();
    const toEnd = parseDay(toStr).getTime();
    const rangeEndMs = Math.min(toEnd + DAY_MS - 1, Date.now());
    const inRange = (value) => {
      const t = toMs(value);
      return t !== null && t >= fromMs && t <= rangeEndMs;
    };

    // ── Period metrics + borrow/return trend (respect ?from / ?to) ──
    const series = createSeries(fromStr, toStr, rangeEndMs);
    let periodBorrows = 0;
    let periodReturns = 0;
    let periodSessions = 0;

    borrowedRows.forEach((t) => {
      const when = t.borrowed_at || t.timestamp || t.created_at;
      if (!inRange(when)) return;
      periodBorrows += 1;
      series.bump(when, "borrowed");
    });

    returnedRows.forEach((t) => {
      const when = t.returned_at || t.timestamp || t.created_at;
      if (!inRange(when)) return;
      periodReturns += 1;
      series.bump(when, "returned");
    });

    // Counted inline rather than bucketed: the dashboard shows a single session
    // total, so there is no series to bump.
    (attendanceRange || []).forEach((r) => {
      if (!inRange(r.date)) return;
      periodSessions += 1;
    });

    const periodOverdue = countOverdueAt(borrowedRows, rangeEndMs);

    const trendBorrowReturn = series.entries.map((row) => ({
      date: row.label,
      borrowed: row.borrowed || 0,
      returned: row.returned || 0,
    }));

    /* The response below is consumed by exactly one caller — DashboardPage — so it
       carries only what that page renders: two user counts, the room totals, the
       incident totals, the trend series and the period block. `todaySessions`
       and `tables.overdueTotal` used to live here; neither has a reader since
       the dashboard's KPI row moved to lifetime totals, and lab_attendance /
       transactions are already read for the period block, so keeping them cost
       payload and code without buying a cheaper query. */
    res.json({
      counts: {
        users: usersAgg.data().count,
        students: studentsAgg.data().count,
      },
      charts: {
        trendBorrowReturn,
      },
      stats: {
        // Incident reports moved from open|investigating|resolved to
        // pending|under_review|approved|rejected|resolved. "Open" means the
        // handler still owes the student an answer, which is the two workflow
        // states that are neither a verdict nor a close-out. Matching on the
        // old "open" string here silently pinned the dashboard KPI to 0.
        openIncidents: (incidents || []).filter((i) =>
          i.status === "pending" || i.status === "under_review" || i.status === "open"
        ).length,
        // Every report ever filed, so the dashboard's headline incident figure is
        // the total workload rather than only the part still open.
        totalIncidents: (incidents || []).length,
        // A head-count query returns no rows, so `count` is the whole payload and
        // is null only if the count was not requested at all.
        totalRooms: roomsAgg?.count || 0,
        activeRooms: activeRoomsAgg?.count || 0,
      },
      period: {
        from: fromStr,
        to: toStr,
        borrows: periodBorrows,
        returns: periodReturns,
        sessions: periodSessions,
        overdue: periodOverdue,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getSummary };
