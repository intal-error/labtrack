import { memo } from "react";
import { fmtDateTime, timeAgo } from "../../utils/helpers";
import { INCIDENT_STATUS_LABELS } from "../../constants/incidents";

/**
 * Renders incident_events as a chronological trail. This is what the student
 * reads to follow their report, and what makes the case auditable for staff:
 * every status change, handler remark and reassignment is a row, so nothing is
 * overwritten and nothing is hidden.
 *
 * Supabase rows arrive camelCased *and* snake_cased (see transformKeys), so
 * both spellings are read defensively.
 */
function read(row, camel, snake) {
  return row?.[camel] ?? row?.[snake] ?? null;
}

const EVENT_HEADINGS = {
  submitted: "Report submitted",
  status_change: "Status changed",
  remark: "Handler remark",
  reassigned: "Reassigned to another handler",
};

function eventIcon(eventType) {
  if (eventType === "submitted") return "submitted";
  if (eventType === "status_change") return "status";
  if (eventType === "reassigned") return "reassigned";
  return "remark";
}

/*
 * Memoised because of where this sits.
 *
 * IncidentDetailModal renders this next to a remark <textarea>. Typing a remark
 * re-renders the modal on every keystroke, and without the memo that re-rendered the
 * whole event trail above the textarea -- an unbounded list of rows, each doing a
 * timeAgo() and a fmtDateTime() -- for no reason at all. `events` arrives from
 * react-query so its reference is stable between refetches.
 */
function IncidentTimeline({ events }) {
  const list = Array.isArray(events) ? events : [];

  if (list.length === 0) {
    return (
      <div className="incident-timeline-empty">
        No activity yet. Updates from the course handler will appear here.
      </div>
    );
  }

  return (
    <ol className="incident-timeline">
      {list.map((event, index) => {
        const type = read(event, "eventType", "event_type") || "remark";
        const from = read(event, "fromStatus", "from_status");
        const to = read(event, "toStatus", "to_status");
        const note = read(event, "note", "note");
        const actor = read(event, "actorName", "actor_name") || "Course handler";
        const role = read(event, "actorRole", "actor_role");
        const createdAt = read(event, "createdAt", "created_at");
        const isLast = index === list.length - 1;

        return (
          <li className={`incident-timeline-item${isLast ? " is-last" : ""}`} key={read(event, "id", "id") || index}>
            <span className={`incident-timeline-dot dot-${eventIcon(type)}`} aria-hidden="true" />
            <div className="incident-timeline-body">
              <div className="incident-timeline-head">
                <span className="incident-timeline-title">{EVENT_HEADINGS[type] || "Update"}</span>
                {to && (
                  <span className="incident-timeline-transition">
                    {from && from !== to && <span className="incident-timeline-from">{INCIDENT_STATUS_LABELS[from] || from}</span>}
                    {from && from !== to && <span className="incident-timeline-arrow">&rarr;</span>}
                    <span className="incident-timeline-to">{INCIDENT_STATUS_LABELS[to] || to}</span>
                  </span>
                )}
              </div>
              {note && <p className="incident-timeline-note">{note}</p>}
              <div className="incident-timeline-meta">
                <span className="incident-timeline-actor">
                  {actor}
                  {role === "student" && <span className="incident-timeline-tag">Reporter</span>}
                </span>
                <span className="incident-timeline-time" title={fmtDateTime(createdAt)}>
                  {timeAgo(createdAt)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default memo(IncidentTimeline);