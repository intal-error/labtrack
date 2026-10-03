import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import {
  useMyBorrowed,
  useMyReturned,
  useMyBorrowRequests,
  useCatalog,
  useReportSummary,
  useStudentAttendance,
  useMyFines,
  useMyNotifications,
  pickNotifications,
} from "../hooks/useQueries";
import { api } from "../services/api";
import { toDate, timeAgo, getOverdueInfo, numOr } from "../utils/helpers";
import DateRangeFilter from "../components/ui/DateRangeFilter";
import { DEFAULT_RANGE, rangeToParams, localDayKey } from "../components/ui/dateRange";
import EmptyChart from "../components/ui/EmptyChart";
import LoadError from "../components/ui/LoadError";
import ChartTooltip from "../components/ui/ChartTooltip";
import KpiCard from "../components/dashboard/KpiCard";
import DeltaBadge from "../components/dashboard/DeltaBadge";
import PanelCard from "../components/dashboard/PanelCard";
import MiniTable from "../components/dashboard/MiniTable";
import StatusDonut from "../components/dashboard/StatusDonut";
import {
  MdQrCodeScanner,
  MdInventory,
  MdHistory,
  MdSwapHoriz,
  MdWarning,
  MdArrowForward,
  MdEventBusy,
  MdInventory2,
  MdEventAvailable,
  MdAttachMoney,
  MdMenuBook,
  MdError,
  MdInfo,
  MdCheckCircle,
  MdNotificationsOff,
  MdCategory,
} from "react-icons/md";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "../styles/pages/dashboard.css";

const DAY_MS = 24 * 60 * 60 * 1000;

/* Supabase rows come back camelCased *and* snake_cased (see transformKeys),
   so read the camel name and fall back. */
const field = (row, camel, snake) => row?.[camel] ?? row?.[snake] ?? null;
const rowName = (r) => field(r, "itemName", "item_name") || "—";

/* `Number(null)` is 0 and `Number("")` is 0, both finite — so a NULL
   available_quantity would read as "none available" and report a fully
   stocked item as entirely on loan. Only a real number counts as an override. */
const isRealNumber = (v) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Total units a catalog row represents. Rows predate the quantity column. */
const totalUnits = (row) => Math.max(1, numOr(field(row, "quantity"), 1));

/** Units of a catalog row that are free to lend right now. */
const freeUnits = (row) => {
  const total = totalUnits(row);
  const raw = field(row, "availableQuantity", "available_quantity");
  if (isRealNumber(raw)) {
    return Math.min(total, Math.max(0, numOr(raw)));
  }
  return String(row?.status || "").toLowerCase() === "borrowed" ? 0 : total;
};

/**
 * The equivalent window immediately before `params`, so period metrics can be
 * diffed against the previous period. Returns null when there is no explicit
 * range (all-time), which dedupes onto the same react-query key.
 */
function previousPeriodParams(params) {
  if (!params?.from || !params?.to) return null;
  const [fy, fm, fd] = params.from.split("-").map(Number);
  const [ty, tm, td] = params.to.split("-").map(Number);
  if (!fy || !ty) return null;
  const spanDays = Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / DAY_MS) + 1;
  return {
    from: localDayKey(new Date(fy, fm - 1, fd - spanDays)),
    to: localDayKey(new Date(ty, tm - 1, td - spanDays)),
  };
}

function spanLabel(params) {
  if (!params?.from || !params?.to) return "vs all-time";
  const [fy, fm, fd] = params.from.split("-").map(Number);
  const [ty, tm, td] = params.to.split("-").map(Number);
  if (!fy || !ty) return "vs previous period";
  const days = Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / DAY_MS) + 1;
  return days > 1 ? `vs previous ${days} days` : "vs previous day";
}

const titleCase = (value) => {
  const s = String(value || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* Endpoints answer with a bare array, or { data, pagination } once a `limit`
   query param switches pagination on. */
const rowsOf = (payload) => (Array.isArray(payload) ? payload : (payload?.data ?? []));

const BADGE_TONE = {
  available: "available",
  borrowed: "inuse",
  pending: "pending",
  scheduled: "scheduled",
  open: "overdue",
  // Incident reports use pending|under_review|approved|rejected|resolved
  // (see constants/incidents.js). Approved is a good outcome, so it takes the
  // positive tone rather than the in-progress one, and rejected shares the
  // negative tone with the legacy "open".
  under_review: "in-progress",
  approved: "available",
  rejected: "overdue",
  // Statuses are written three different ways across the app, so match all of
  // them rather than letting an unlisted one fall through to grey:
  // IncidentTab uses "investigating", MaintenanceTab uses "in-progress".
  investigating: "in-progress",
  "in-progress": "in-progress",
  in_progress: "in-progress",
  "in progress": "in-progress",
  resolved: "resolved",
  completed: "resolved",
  closed: "resolved",
};

function statusBadge(status) {
  const key = String(status || "").toLowerCase();
  return (
    <span className={`dash-badge ${BADGE_TONE[key] || "neutral"}`}>{titleCase(status)}</span>
  );
}

/* `new Date("2026-10-02")` is parsed as UTC midnight, which then formats as the
   PREVIOUS day for any timezone west of UTC. Postgres DATE columns (due_date,
   scheduled_date) arrive exactly like that, and the backend treats a bare
   YYYY-MM-DD as a plain calendar date, so build those in local time. Anything
   carrying a time component falls through to toDate untouched. */
function toLocalDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.trim().split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return toDate(value);
}

function formatShortDate(date) {
  const d = toLocalDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRangeDate(value) {
  if (!value || typeof value !== "string") return "—";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return formatShortDate(value);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* Mirrors NotificationsTab.jsx so the dashboard strip and the full page agree. */
const NOTIF_TYPE = {
  alert: { Icon: MdError, tone: "red" },
  overdue: { Icon: MdError, tone: "red" },
  warning: { Icon: MdWarning, tone: "orange" },
  success: { Icon: MdCheckCircle, tone: "green" },
  info: { Icon: MdInfo, tone: "blue" },
};

function formatTableDate(value) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + ", "
    + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function LoadingState() {
  return (
    <div className="dash-page">
      <div className="page-loading">
        <div className="spinner-lg" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                   STUDENT DASHBOARD            */
/* ═══════════════════════════════════════════════ */
function StudentDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  const { data: borrowedData, isLoading: borrowedLoading } = useMyBorrowed();
  const { data: returnedData } = useMyReturned({ limit: 8 });
  const { data: myRequestsData } = useMyBorrowRequests();
  const { data: finesData } = useMyFines();
  const { data: attendanceData } = useStudentAttendance(userProfile?.schoolId);
  const { data: notifData } = useMyNotifications("limit=4");

  const borrowed = useMemo(() => borrowedData || [], [borrowedData]);
  const returned = useMemo(
    () => (Array.isArray(returnedData) ? returnedData : returnedData?.data || []),
    [returnedData]
  );
  const requests = useMemo(() => myRequestsData || [], [myRequestsData]);
  const fines = useMemo(() => finesData || [], [finesData]);
  const records = useMemo(() => attendanceData?.records || [], [attendanceData]);
  const notifications = useMemo(() => pickNotifications(notifData), [notifData]);

  const overdueItems = useMemo(() => {
    const now = new Date();
    return borrowed.filter((t) => {
      const d = toDate(t.dueDate);
      return d && d < now;
    });
  }, [borrowed]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );

  const unpaidFines = useMemo(
    () => fines.filter((f) => f.status === "pending"),
    [fines]
  );

  const totalSessions = attendanceData?.summary?.totalSessions || 0;

  const activeSession = useMemo(
    () => records.find((r) => r.status === "active"),
    [records]
  );

  const statusItems = [
    {
      key: "borrowed",
      label: "Items out",
      value: borrowed.length,
      detail: overdueItems.length > 0
        ? `${overdueItems.length} overdue`
        : borrowed.length > 0 ? "All on time" : "Nothing borrowed",
      tone: overdueItems.length > 0 ? "alert" : "ok",
      icon: MdSwapHoriz,
      path: "/my-activity?tab=borrowed",
    },
    {
      key: "fines",
      label: "Unpaid fines",
      value: unpaidFines.length,
      detail: unpaidFines.length > 0 ? "Settle at the lab counter" : "Nothing to pay",
      tone: unpaidFines.length > 0 ? "alert" : "ok",
      icon: MdAttachMoney,
      path: "/my-activity?tab=fines",
    },
    {
      key: "sessions",
      label: "Lab sessions",
      value: totalSessions,
      detail: activeSession
        ? `In ${activeSession.labRoom || "the lab"} now`
        : pendingRequests.length > 0
          ? `${pendingRequests.length} request${pendingRequests.length > 1 ? "s" : ""} awaiting approval`
          : "Attendance log",
      tone: activeSession || pendingRequests.length === 0 ? "ok" : "warn",
      icon: MdEventAvailable,
      path: "/my-activity?tab=attendance",
    },
  ];

  const recentTxns = useMemo(() => {
    const rows = [];
    borrowed.forEach((t) => {
      const at = toDate(t.timestamp) || toDate(t.borrowedAt);
      const dueAt = toDate(t.dueDate);
      rows.push({
        key: `borrow-${t.id}`,
        item: t.itemName || "Unnamed item",
        course: t.equipmentCourse || "—",
        at,
        kind: "borrowed",
        overdue: getOverdueInfo(dueAt),
        due: dueAt ? `Due ${formatShortDate(dueAt)}` : null,
      });
    });
    returned.forEach((t) => {
      const at = toDate(t.timestamp) || toDate(t.returnedAt);
      rows.push({
        key: `return-${t.id}`,
        item: t.itemName || "Unnamed item",
        course: t.equipmentCourse || "—",
        at,
        kind: "returned",
        overdue: null,
        due: null,
      });
    });
    return rows
      .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))
      .slice(0, 5);
  }, [borrowed, returned]);

  const recordRows = [
    {
      key: "attendance",
      label: "Attendance Record",
      desc: "View your lab attendance logs",
      icon: MdEventAvailable,
      tone: "blue",
      path: "/my-activity?tab=attendance",
      meta: `${totalSessions} session${totalSessions === 1 ? "" : "s"}`,
    },
    {
      key: "borrowing",
      label: "Borrowing History",
      desc: "View borrowed and returned items",
      icon: MdInventory,
      tone: "teal",
      path: "/my-activity?tab=borrowed",
      meta: `${borrowed.length} out`,
    },
    {
      key: "manuals",
      label: "Laboratory Manuals",
      desc: "View available lab manuals",
      icon: MdMenuBook,
      tone: "green",
      path: "/resources?tab=manuals",
      meta: null,
    },
    {
      key: "incident",
      label: "Incident Reports",
      desc: "Report a damaged or lost item, track progress",
      icon: MdWarning,
      tone: "orange",
      path: "/my-activity?tab=incidents",
      meta: null,
    },
  ];

  function openNotification(n) {
    if (!n?.read) {
      api.markNotificationRead(n.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["myNotifications"] });
    }
    navigate(n?.link || "/notifications");
  }

  if (borrowedLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      <div className="dash-status-bar">
        {statusItems.map(({ key, label, value, detail, tone, icon: Icon, path }) => (
          <button
            key={key}
            type="button"
            className={`dash-status-chip ${tone}`}
            onClick={() => navigate(path)}
          >
            <span className="dash-status-icon"><Icon size={18} /></span>
            <span className="dash-status-body">
              <span className="dash-status-line">
                <strong>{value}</strong> {label}
              </span>
              <span className="dash-status-detail">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="sd-grid">
        {/* ── Scan QR ── */}
        <section className="sd-card sd-scan">
          <div className="sd-scan-frame">
            <MdQrCodeScanner size={64} />
          </div>
          <h3 className="sd-scan-title">Scan QR Code</h3>
          <p className="sd-scan-sub">Borrow &middot; Return &middot; Attendance</p>
          <div className="sd-scan-actions">
            <button
              className="btn btn-primary sd-scan-btn"
              onClick={() => navigate("/scanner")}
            >
              <MdQrCodeScanner size={18} /> Borrow &amp; Return
            </button>
            <button
              className="btn btn-outline sd-scan-btn"
              onClick={() => navigate("/scanner?tab=attendance")}
            >
              <MdEventAvailable size={18} /> Log Attendance
            </button>
          </div>
        </section>

        {/* ── My Records ── */}
        <section className="sd-card sd-records">
          <div className="sd-card-head">
            <h3>My Records</h3>
          </div>
          <ul className="sd-record-list">
            {recordRows.map(({ key, label, desc, icon: Icon, tone, path, meta }) => (
              <li key={key}>
                <button className="sd-record" onClick={() => navigate(path)}>
                  <span className={`sd-record-icon ${tone}`}>
                    <Icon size={20} />
                  </span>
                  <span className="sd-record-text">
                    <span className="sd-record-label">{label}</span>
                    <span className="sd-record-desc">{desc}</span>
                  </span>
                  {meta && <span className="sd-record-meta">{meta}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Recent Transactions ── */}
        <section className="sd-card sd-txn">
          <div className="sd-card-head">
            <h3>Recent Transactions</h3>
            <button className="dash-section-link" onClick={() => navigate("/my-activity")}>
              View all <MdArrowForward size={14} />
            </button>
          </div>
          {recentTxns.length === 0 ? (
            <div className="sd-empty">
              <MdHistory size={26} />
              <p>No transactions yet. Scan a QR code to borrow your first item.</p>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Course</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxns.map((t) => (
                    <tr key={t.key}>
                      <td className="sd-txn-item">{t.item}</td>
                      <td>{t.course}</td>
                      <td>{formatTableDate(t.at)}</td>
                      <td>
                        {t.overdue ? (
                          <span className="dash-badge overdue">{t.overdue.text}</span>
                        ) : t.kind === "returned" ? (
                          <span className="dash-badge returned">Returned</span>
                        ) : (
                          <span className="dash-badge borrowed">{t.due || "Borrowed"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Notifications ── */}
        <section className="sd-card sd-notif">
          <div className="sd-card-head">
            <h3>Notifications</h3>
            <button className="dash-section-link" onClick={() => navigate("/notifications")}>
              View all <MdArrowForward size={14} />
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="sd-empty">
              <MdNotificationsOff size={26} />
              <p>You&apos;re all caught up — no notifications.</p>
            </div>
          ) : (
            <ul className="sd-notif-list">
              {notifications.map((n, idx) => {
                const { Icon, tone } = NOTIF_TYPE[n.type] || NOTIF_TYPE.info;
                return (
                  <li key={n.id || `sd-notif-${idx}`}>
                    <button
                      className={`sd-notif-row ${n.read ? "" : "unread"}`}
                      onClick={() => openNotification(n)}
                    >
                      <span className={`sd-notif-icon ${tone}`}>
                        <Icon size={18} />
                      </span>
                      <span className="sd-notif-body">
                        <span className="sd-notif-title">{n.title || "Notification"}</span>
                        {n.message && (
                          <span className="sd-notif-msg">{n.message}</span>
                        )}
                      </span>
                      <span className="sd-notif-time">{timeAgo(n.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                   ADMIN DASHBOARD              */
/* ═══════════════════════════════════════════════ */
function AdminDashboard() {
  const [range, setRange] = useState(DEFAULT_RANGE);
  // Preset ranges are relative to "today", so re-resolve once the calendar day rolls over.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setToday((prev) => {
        const now = new Date();
        return prev.toDateString() === now.toDateString() ? prev : now;
      });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const rangeParams = useMemo(() => rangeToParams(range, today), [range, today]);
  // The window immediately before this one. /reports/summary only ever builds a
  // series for the requested range, so this second (cached) call is what makes a
  // real period-over-period delta possible without a backend change.
  const prevParams = useMemo(() => previousPeriodParams(rangeParams), [rangeParams]);
  const vsLabel = useMemo(() => spanLabel(rangeParams), [rangeParams]);

  const {
    data: rawData,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchSummary,
  } = useReportSummary(rangeParams);
  const { data: prevData } = useReportSummary(prevParams);

  const { data: catalogData } = useCatalog();

  const summary = rawData || {};
  const counts = summary.counts || {};
  const stats = summary.stats || {};
  const charts = summary.charts || {};
  const tables = summary.tables || {};
  const period = summary.period || {};
  const prevPeriod = prevData?.period || {};
  const hasPrev = !!prevParams;
  const delta = (key) => (hasPrev ? numOr(period[key]) - numOr(prevPeriod[key]) : undefined);

  const catalogRows = useMemo(() => rowsOf(catalogData), [catalogData]);

  /* Equipment is tracked as catalog rows with a quantity, and "available" is
     decremented per unit — so a row is only a single status when its quantities
     agree. Split each row's units across the four operational states instead of
     pretending a partially-borrowed row is one thing. */
  const equipment = useMemo(() => {
    const buckets = {
      Available: 0,
      "In Use": 0,
      "Under Maintenance": 0,
      "Out of Service": 0,
    };
    let units = 0;
    let items = 0;
    let available = 0;

    catalogRows.forEach((row) => {
      const total = totalUnits(row);
      const free = freeUnits(row);
      const condition = String(field(row, "condition") || "").toLowerCase();

      items += 1;
      units += total;
      available += free;
      buckets["In Use"] += total - free;

      if (condition === "missing") {
        buckets["Out of Service"] += free;
      } else if (condition === "for repair" || condition === "damaged") {
        buckets["Under Maintenance"] += free;
      } else {
        buckets.Available += free;
      }
    });

    return { buckets, units, items, available };
  }, [catalogRows]);

  const equipmentStatusData = useMemo(
    () =>
      ["Available", "In Use", "Under Maintenance", "Out of Service"]
        .map((name) => ({ name, value: equipment.buckets[name] }))
        .filter((d) => d.value > 0),
    [equipment]
  );

  const catalogPreview = useMemo(
    () =>
      [...catalogRows]
        .sort((a, b) => String(rowName(a)).localeCompare(String(rowName(b))))
        .slice(0, 6),
    [catalogRows]
  );

  const incidentCounts = useMemo(() => {
    const byStatus = {};
    (charts.incidentData || []).forEach((d) => {
      byStatus[String(d.name).toLowerCase()] = d.value;
    });
    return byStatus;
  }, [charts.incidentData]);

  // The backend zero-fills one bucket per day/week/month, so emptiness has to
  // come from the values — not from whether the array has anything in it.
  const trendBorrowReturn = useMemo(() => charts.trendBorrowReturn || [], [charts.trendBorrowReturn]);

  const hasBorrowActivity = trendBorrowReturn.some((d) => d.borrowed > 0 || d.returned > 0);

  const kpis = [
    {
      icon: MdInventory2,
      tone: "green",
      label: "Total Equipment",
      value: equipment.units,
      sub: `${equipment.items} items · ${equipment.available} available`,
    },
    {
      icon: MdHistory,
      tone: "orange",
      label: "Items On Loan",
      value: counts.borrowed || 0,
      sub: `${tables.overdueTotal || 0} overdue now`,
      delta: delta("borrows"),
      deltaCaption: `borrows ${vsLabel}`,
    },
    {
      icon: MdEventAvailable,
      tone: "teal",
      label: "Sessions Today",
      value: stats.todaySessions || 0,
      delta: delta("sessions"),
      deltaCaption: vsLabel,
    },
    {
      icon: MdWarning,
      tone: "red",
      label: "Open Incidents",
      value: stats.openIncidents || 0,
      sub: `${incidentCounts.resolved || 0} resolved all time`,
    },
  ];

  const periodStats = [
    { icon: MdHistory, tone: "orange", label: "Borrows", value: period.borrows || 0, delta: delta("borrows") },
    { icon: MdSwapHoriz, tone: "green", label: "Returns", value: period.returns || 0, delta: delta("returns") },
    { icon: MdEventAvailable, tone: "teal", label: "Lab Sessions", value: period.sessions || 0, delta: delta("sessions") },
    { icon: MdEventBusy, tone: "red", label: "Overdue Items", value: period.overdue || 0, delta: delta("overdue"), deltaInvert: true },
  ];

  /* Percentages drive a <colgroup> under table-layout:fixed, so the table is
     always exactly its panel's width. Each figure is the cell's border-box
     share; the ~16px of 8px side padding inside it is already accounted for.
     Status columns are sized for the widest badge ("Investigating" ~88px). */
  const catalogColumns = [
    { key: "item", header: "Item", clip: true, width: "28%", render: rowName },
    { key: "category", header: "Category", clip: true, width: "20%", render: (r) => field(r, "category") || "—" },
    { key: "units", header: "Units", width: "10%", render: totalUnits },
    { key: "available", header: "Avail.", width: "16%", render: (r) => `${freeUnits(r)} / ${totalUnits(r)}` },
    { key: "status", header: "Status", width: "26%", render: (r) => statusBadge(r?.status) },
  ];

  if (reportLoading) return <LoadingState />;

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div className="dash-head-text">
          <h2>Dashboard</h2>
          <span className="dash-head-sub">
            {formatRangeDate(period.from)} – {formatRangeDate(period.to)} ·{" "}
            {counts.students || 0} students · {counts.users || 0} registered users
          </span>
        </div>
        <div className="dash-head-filter">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {/* Keep everything on screen when a refetch fails — the banner explains
          the problem instead of blanking the page. */}
      {reportError && (
        <LoadError
          message="Couldn't load dashboard data."
          onRetry={refetchSummary}
        />
      )}

      <div className="dash-kpis">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="dash-period-strip">
        <div className="dash-period-head">
          <h3>In selected period</h3>
          <span className="dash-period-compare">
            {hasPrev ? vsLabel : "No earlier period to compare"}
          </span>
        </div>
        <div className="dash-period-metrics">
          {periodStats.map(({ icon: Icon, tone, label, value, delta, deltaInvert }) => (
            <div key={label} className="dash-period-metric">
              <span className={`dash-period-icon ${tone}`}>
                <Icon size={15} />
              </span>
              <span className="dash-period-body">
                <span className="dash-period-value">{value}</span>
                <span className="dash-period-label">{label}</span>
              </span>
              {delta !== undefined && delta !== null && (
                <DeltaBadge value={delta} invert={deltaInvert} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="dash-grid">
        <PanelCard
          icon={MdInventory2}
          title="Laboratory Overview"
          actionTo="/catalog"
          span={2}
        >
          <MiniTable
            columns={catalogColumns}
            rows={catalogPreview}
            empty="No catalog items yet"
          />
        </PanelCard>

        <PanelCard icon={MdCategory} title="Equipment Status">
          <StatusDonut
            data={equipmentStatusData}
            total={equipment.units}
            totalLabel="Units"
          />
        </PanelCard>

        {/* span 3: this is the only panel on the second grid row, so it takes
            the full width rather than leaving column 3 empty. */}
        <PanelCard icon={MdSwapHoriz} title="Borrow & Return Volume" span={3}>
          <div className="dash-chart-body">
            {hasBorrowActivity ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart
                    data={trendBorrowReturn}
                    margin={{ top: 5, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="borrowed"
                      name="Borrows"
                      stroke="#2e7d32"
                      fill="#2e7d32"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="returned"
                      name="Returns"
                      stroke="#1976d2"
                      fill="#1976d2"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="dash-chart-legend">
                  <span className="dash-legend-item">
                    <span className="dash-legend-dot" style={{ background: "#2e7d32" }} />
                    Borrows
                  </span>
                  <span className="dash-legend-item">
                    <span className="dash-legend-dot" style={{ background: "#1976d2" }} />
                    Returns
                  </span>
                </div>
              </>
            ) : (
              <EmptyChart text="No borrow or return activity in this period" />
            )}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*                 MAIN DASHBOARD PAGE            */
/* ═══════════════════════════════════════════════ */
export default function DashboardPage() {
  const { role, loading } = useAuth();

  if (loading) return <LoadingState />;

  return role === "admin" ? <AdminDashboard /> : <StudentDashboard />;
}
