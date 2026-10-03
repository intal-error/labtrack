import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIncidents, useActiveAdmins } from "../../hooks/useQueries";
import IncidentReportForm from "../incidents/IncidentReportForm";
import IncidentDetailModal from "../incidents/IncidentDetailModal";
import Pagination from "../ui/Pagination";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_COLORS,
  SEVERITY_OPTIONS,
  OPEN_INCIDENT_STATUSES,
} from "../../constants/incidents";
import { timeAgo, fmtDate } from "../../utils/helpers";
import {
  MdWarning,
  MdAdd,
  MdSearch,
  MdInfo,
  MdOutlineWarning,
  MdCameraAlt,
  MdCheckCircle,
  MdClose,
  MdPerson,
  MdAssignment,
  MdSchedule,
  MdSwapHoriz,
} from "react-icons/md";

import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import "../../styles/pages/incident-reports.css";

const PAGE_LIMIT = 12;

/** Sentinel for the "no handler" option in the handler filter. */
const UNASSIGNED = "__unassigned";

/**
 * Course handlers' work queue. Scoped server-side to the handler's courses, so
 * this list only ever contains reports that are theirs to act on.
 *
 * Replaces the old IncidentTab, which mixed the staff queue with the student
 * reporting form and had no notion of assignment at all.
 */
export default function IncidentReportsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change invalidates the current page number, matching the reset
  // idiom used across the other tabs.
  const [prevResetKeys, setPrevResetKeys] = useState([
    debouncedSearch,
    statusFilter,
    severityFilter,
    assignedFilter,
    dateFrom,
    dateTo,
  ]);
  if (
    prevResetKeys[0] !== debouncedSearch ||
    prevResetKeys[1] !== statusFilter ||
    prevResetKeys[2] !== severityFilter ||
    prevResetKeys[3] !== assignedFilter ||
    prevResetKeys[4] !== dateFrom ||
    prevResetKeys[5] !== dateTo
  ) {
    setPrevResetKeys([debouncedSearch, statusFilter, severityFilter, assignedFilter, dateFrom, dateTo]);
    setPage(1);
  }

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", page);
    p.set("limit", PAGE_LIMIT);
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim());
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (severityFilter !== "all") p.set("severity", severityFilter);
    // "__unassigned" is a UI sentinel, not a uid. The server needs to be told
    // which of the two it is, so an unassigned report is not queried as if the
    // handler's id happened to be the string "__unassigned".
    if (assignedFilter === UNASSIGNED) p.set("unassigned", "true");
    else if (assignedFilter) p.set("assignedTo", assignedFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [page, debouncedSearch, statusFilter, severityFilter, assignedFilter, dateFrom, dateTo]);

  const { data: incidentsData, isLoading } = useIncidents(params);
  const { data: adminsData } = useActiveAdmins();

  const incidents = useMemo(() => {
    if (!incidentsData) return [];
    if (Array.isArray(incidentsData)) return incidentsData;
    return Array.isArray(incidentsData.data) ? incidentsData.data : [];
  }, [incidentsData]);

  const paginationData = useMemo(() => {
    if (!incidentsData || Array.isArray(incidentsData)) return null;
    return incidentsData.pagination || null;
  }, [incidentsData]);

  const admins = useMemo(() => (Array.isArray(adminsData) ? adminsData : []), [adminsData]);

  const stats = useMemo(() => {
    const counts = { all: incidents.length };
    INCIDENT_STATUSES.forEach((s) => {
      counts[s] = incidents.filter((i) => i.status === s).length;
    });
    return counts;
  }, [incidents]);

  function selectFilter(next) {
    setStatusFilter((prev) => (prev === next ? "all" : next));
    setPage(1);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["incidents"] });
    queryClient.invalidateQueries({ queryKey: ["incident"] });
  }

  const hasFilters =
    Boolean(debouncedSearch.trim()) ||
    statusFilter !== "all" ||
    severityFilter !== "all" ||
    Boolean(assignedFilter) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const statCards = [
    { key: "all", label: "Total", icon: <MdWarning size={20} /> },
    { key: "pending", label: "Pending", icon: <MdSchedule size={20} /> },
    { key: "under_review", label: "Under Review", icon: <MdOutlineWarning size={20} /> },
    { key: "approved", label: "Approved", icon: <MdCheckCircle size={20} /> },
    { key: "rejected", label: "Rejected", icon: <MdClose size={20} /> },
    { key: "resolved", label: "Resolved", icon: <MdCheckCircle size={20} /> },
  ];

  return (
    <div className="tab-content">
      <button className="hero-action-btn ghost" onClick={() => setShowForm(true)}>
        <MdAdd size={16} /> File a Report
      </button>

      <div className="incident-stats">
        {statCards.map((card) => (
          <div
            className={`incident-stat-card ${statusFilter === card.key ? "active" : ""}`}
            key={card.key}
            onClick={() => selectFilter(card.key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectFilter(card.key);
              }
            }}
          >
            <div className={`incident-stat-icon ${card.key}`}>{card.icon}</div>
            <div className="incident-stat-info">
              <span className="incident-stat-number">{stats[card.key] || 0}</span>
              <span className="incident-stat-label">{card.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="incident-toolbar">
        <div className="incident-filter-tabs">
          <button
            className={`incident-filter-btn ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => {
              setStatusFilter("all");
              setPage(1);
            }}
          >
            All
          </button>
          {INCIDENT_STATUSES.map((s) => (
            <button
              key={s}
              className={`incident-filter-btn ${statusFilter === s ? "active" : ""}`}
              onClick={() => selectFilter(s)}
            >
              {INCIDENT_STATUS_LABELS[s]}
              {stats[s] > 0 && <span className="filter-count">{stats[s]}</span>}
            </button>
          ))}
          <div className="incident-filter-divider" />
          <div className="incident-date-range">
            <input
              type="date"
              className="incident-date-filter"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="From date"
            />
          </div>
          <div className="incident-date-range">
            <input
              type="date"
              className="incident-date-filter"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="To date"
            />
          </div>
          <select
            className="incident-severity-filter"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by severity"
          >
            <option value="all">All Severity</option>
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="incident-severity-filter"
            value={assignedFilter}
            onChange={(e) => {
              setAssignedFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by handler"
          >
            <option value="">Any Handler</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {[a.firstName, a.lastName].filter(Boolean).join(" ")}
              </option>
            ))}
            <option value={UNASSIGNED}>Unassigned</option>
          </select>
          <div className="incident-search">
            <MdSearch size={16} />
            <input
              type="text"
              placeholder="Search item, student, handler..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="page-loading">
          <div className="spinner-lg" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="incident-empty">
          <div className="incident-empty-icon">
            <MdWarning size={56} />
          </div>
          <h3>{hasFilters ? "No matching reports" : "No incident reports for your courses"}</h3>
          <p>
            {hasFilters
              ? "Try adjusting your search or filters."
              : "Reports from students in the courses you handle will appear here."}
          </p>
        </div>
      ) : (
        <div className="incident-list-grid">
          {incidents.map((inc) => {
            const severity = inc.severity;
            const isOpen = OPEN_INCIDENT_STATUSES.includes(inc.status);
            return (
              <div className={`incident-card incident-severity-${severity}`} key={inc.id} onClick={() => setSelectedId(inc.id)}>
                <div className="incident-card-header">
                  <div className="incident-card-title">
                    <span className="incident-severity-dot" style={{ background: SEVERITY_COLORS[severity] }} />
                    <span className="incident-card-title-text">{inc.title}</span>
                  </div>
                  <div className="incident-badges">
                    <span
                      className="badge"
                      style={{
                        background: `${SEVERITY_COLORS[severity]}15`,
                        color: SEVERITY_COLORS[severity],
                        border: `1px solid ${SEVERITY_COLORS[severity]}30`,
                      }}
                    >
                      {severity}
                    </span>
                    <span className={`badge incident-status-badge status-${inc.status}`}>
                      {INCIDENT_STATUS_LABELS[inc.status] || inc.status}
                    </span>
                  </div>
                </div>
                <div className="incident-card-body">
                  <div className="incident-meta">
                    <span className="incident-meta-item">
                      <MdInfo size={12} /> {INCIDENT_TYPE_LABELS[inc.type] || inc.type}
                    </span>
                    <span className="incident-meta-item">
                      <MdPerson size={12} /> {inc.reporterName}
                    </span>
                    {inc.reporterCourse && (
                      <span className="incident-meta-item incident-course-chip">{inc.reporterCourse}</span>
                    )}
                    {inc.photos?.length > 0 && (
                      <span className="incident-meta-item incident-photo-badge">
                        <MdCameraAlt size={12} /> {inc.photos.length}
                      </span>
                    )}
                  </div>
                  <div className="incident-meta">
                    <span className="incident-meta-item">
                      <MdAssignment size={12} /> {inc.itemName}
                    </span>
                    <span className="incident-meta-item incident-time">
                      <MdSchedule size={12} /> {fmtDate(inc.incidentDate)}
                    </span>
                  </div>
                  <div className="incident-assigned-row">
                    {inc.assignedToName ? (
                      <span className="incident-assigned-chip">
                        <MdAssignment size={12} /> {inc.assignedToName}
                      </span>
                    ) : (
                      <span className="incident-assigned-chip is-unassigned">
                        <MdSwapHoriz size={12} /> Unassigned
                      </span>
                    )}
                    <span className="incident-meta-item incident-time">{timeAgo(inc.createdAt)}</span>
                  </div>
                  <p className="incident-desc">
                    {inc.description?.length > 140 ? `${inc.description.slice(0, 140)}...` : inc.description}
                  </p>
                </div>
                {isOpen && (
                  <div className="incident-card-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(inc.id);
                      }}
                    >
                      Review
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paginationData && paginationData.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={paginationData.totalPages}
          totalItems={paginationData.total}
          pageSize={PAGE_LIMIT}
          onPageChange={setPage}
        />
      )}

      <IncidentReportForm open={showForm} onClose={() => setShowForm(false)} onSubmitted={invalidate} />

      {selectedId && (
        <IncidentDetailModal incidentId={selectedId} onClose={() => setSelectedId(null)} onChanged={invalidate} />
      )}
    </div>
  );
}