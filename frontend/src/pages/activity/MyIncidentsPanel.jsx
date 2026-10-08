import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMyIncidents } from "../../hooks/useQueries";
import IncidentReportForm from "../../components/incidents/IncidentReportForm";
import IncidentDetailModal from "../../components/incidents/IncidentDetailModal";
import Pagination from "../../components/ui/Pagination";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_COLORS,
  SEVERITY_OPTIONS,
  OPEN_INCIDENT_STATUSES,
} from "../../constants/incidents";
import { fmtDate, timeAgo } from "../../utils/helpers";
import {
  MdWarning,
  MdAdd,
  MdSearch,
  MdInfo,
  MdCameraAlt,
  MdPerson,
  MdAssignment,
  MdSchedule,
  MdCheckCircle,
} from "react-icons/md";

import "../../styles/pages/tabs.css";
import "../../styles/pages/shared-form-panel.css";
import "../../styles/pages/incident-reports.css";

const PAGE_LIMIT = 10;

/**
 * The student's side of the workflow: file a report, and track its status plus
 * the handler's remarks. Deliberately read-only beyond filing — a student can
 * see where their report is and what was said about it, and nothing else.
 */
export default function MyIncidentsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  /*
 * `search` is NOT part of this key, deliberately.
 *
 * It used to be, which meant every keystroke minted a new query key and fired a
 * request to /incidents/mine -- and that endpoint does not take a search param (see
 * the comment on `visible` below), so every one of those requests returned the same
 * rows. The search is filtered client-side by `visible` instead, which is the correct
 * design for a student's own short list; sending it to the server was cost with no
 * effect.
 */
const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", page);
    p.set("limit", PAGE_LIMIT);
    if (statusFilter !== "all") p.set("status", statusFilter);
    return p.toString();
  }, [page, statusFilter]);

  const [prevResetKeys, setPrevResetKeys] = useState([statusFilter, search]);
  if (prevResetKeys[0] !== statusFilter || prevResetKeys[1] !== search) {
    setPrevResetKeys([statusFilter, search]);
    setPage(1);
  }

  const { data: incidentsData, isLoading } = useMyIncidents(params);

  const incidents = useMemo(() => {
    if (!incidentsData) return [];
    if (Array.isArray(incidentsData)) return incidentsData;
    return Array.isArray(incidentsData.data) ? incidentsData.data : [];
  }, [incidentsData]);

  const paginationData = useMemo(() => {
    if (!incidentsData || Array.isArray(incidentsData)) return null;
    return incidentsData.pagination || null;
  }, [incidentsData]);

  const stats = useMemo(() => {
    const counts = { all: incidents.length };
    INCIDENT_STATUSES.forEach((s) => {
      counts[s] = incidents.filter((i) => i.status === s).length;
    });
    return counts;
  }, [incidents]);

  // Client-side search, applied to the CURRENT PAGE only.
  //
  // This is the same filter that used to be duplicated in the query key, where it
  // also triggered a pointless refetch per keystroke. Now it runs on whatever the
  // server returned for this page -- so it narrows within the page rather than
  // across all of the student's reports. Pagination is therefore page-scoped with
  // respect to search, which is the behaviour a student's own (short) list needs and
  // matches what the other panels already do.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter(
      (i) =>
        (i.title || "").toLowerCase().includes(q) ||
        (i.itemName || "").toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q)
    );
  }, [incidents, search]);

  const openCount = OPEN_INCIDENT_STATUSES.reduce((sum, s) => sum + (stats[s] || 0), 0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["myIncidents"] });
    queryClient.invalidateQueries({ queryKey: ["incident"] });
  }

  return (
    <div className="tab-content">
      <button className="hero-action-btn ghost" onClick={() => setShowForm(true)}>
        <MdAdd size={16} /> Report Damaged / Lost Item
      </button>

      <p className="incident-my-intro">
        Report an item you borrowed that got damaged, broke or went missing. Your course handler reviews it and you can
        follow the status and read their remarks here.
      </p>

      <div className="incident-stats">
        {[
          { key: "all", label: "All", icon: <MdWarning size={20} /> },
          { key: "pending", label: "Pending", icon: <MdSchedule size={20} /> },
          { key: "under_review", label: "Under Review", icon: <MdInfo size={20} /> },
          { key: "approved", label: "Approved", icon: <MdCheckCircle size={20} /> },
          { key: "rejected", label: "Rejected", icon: <MdInfo size={20} /> },
          { key: "resolved", label: "Resolved", icon: <MdCheckCircle size={20} /> },
        ].map((card) => (
          <div
            className={`incident-stat-card ${statusFilter === card.key ? "active" : ""}`}
            key={card.key}
            onClick={() => {
              setStatusFilter((prev) => (prev === card.key ? "all" : card.key));
              setPage(1);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter((prev) => (prev === card.key ? "all" : card.key));
                setPage(1);
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

      {openCount > 0 && (
        <div className="incident-open-banner">
          <span className="overdue-pulse" />
          <strong>{openCount}</strong> report{openCount > 1 ? "s" : ""} awaiting a decision from your course handler
        </div>
      )}

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
              onClick={() => {
                setStatusFilter((prev) => (prev === s ? "all" : s));
                setPage(1);
              }}
            >
              {INCIDENT_STATUS_LABELS[s]}
              {stats[s] > 0 && <span className="filter-count">{stats[s]}</span>}
            </button>
          ))}
          <div className="incident-search">
            <MdSearch size={16} />
            <input
              type="text"
              placeholder="Search your reports..."
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
          <h3>{search || statusFilter !== "all" ? "No matching reports" : "No reports yet"}</h3>
          <p>
            {search || statusFilter !== "all"
              ? "Try a different search or filter."
              : "If you damage or lose an item you borrowed, report it here."}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="incident-empty">
          <div className="incident-empty-icon">
            <MdSearch size={48} />
          </div>
          <h3>No matching reports</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="incident-list-grid">
          {visible.map((inc) => {
            const severity = inc.severity;
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
                      {SEVERITY_OPTIONS.find((s) => s.value === severity)?.label || severity}
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
                      <MdAssignment size={12} /> {inc.itemName}
                    </span>
                    {inc.photos?.length > 0 && (
                      <span className="incident-meta-item incident-photo-badge">
                        <MdCameraAlt size={12} /> {inc.photos.length}
                      </span>
                    )}
                  </div>
                  <div className="incident-assigned-row">
                    <span className="incident-assigned-chip">
                      <MdPerson size={12} />
                      {inc.assignedToName ? inc.assignedToName : "Awaiting assignment"}
                    </span>
                    <span className="incident-meta-item incident-time">
                      <MdSchedule size={12} /> {fmtDate(inc.incidentDate)}
                    </span>
                  </div>
                  <p className="incident-desc">
                    {inc.description?.length > 140 ? `${inc.description.slice(0, 140)}...` : inc.description}
                  </p>
                  {inc.resolution && <p className="incident-resolution-line">Outcome: {inc.resolution}</p>}
                  <span className="incident-filed-note">Filed {timeAgo(inc.createdAt)}</span>
                </div>
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