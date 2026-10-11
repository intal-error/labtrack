import { MdEventBusy, MdCalendarToday, MdCheckCircle, MdVisibility } from "react-icons/md";
import { fmtDate } from "../../utils/helpers";
import { STATUS_LABELS } from "../../constants/fines";
import "../../styles/pages/tabs.css";

const DASH = "—";

/**
 * One of the STUDENT's fines as a card.
 *
 * The student branch of FinesTab renders `.fines-table` with eight columns and
 * a `min-width:640px` floor (tabs.css:946). On a phone that is a desktop table
 * needing a sideways swipe for what is, in the end, one equipment name, one
 * amount and one status.
 *
 * The amount is promoted to the card's headline because it is the single figure
 * a student opening this tab is looking for, and the status pill keeps the
 * exact `.fines-status-*` class the table used so the two layouts can never
 * disagree about colour.
 *
 * The `.fines-outstanding` banner above this list is intentionally NOT hidden:
 * it is actionable state, not a summary tile, and it is the only place the
 * "settle at the counter" call to action lives.
 */
export default function StudentFineCard({ fine, onSelect }) {
  const outstanding = fine.status === "pending";

  return (
    <article
      className={`fine-card${outstanding ? " fine-card--outstanding" : ""}`}
      onClick={() => onSelect?.(fine)}
      role="button"
      tabIndex={0}
      aria-label={`${fine.itemName || "Fine"} — ${STATUS_LABELS[fine.status] || fine.status}`}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect?.(fine);
      }}
    >
      <header className="fine-card-head">
        <div className="fine-card-heading">
          <h3 className="fine-card-name" title={fine.itemName}>
            {fine.itemName || DASH}
          </h3>
          <span className={`fines-status-badge fines-status-${fine.status}`}>
            {STATUS_LABELS[fine.status] || fine.status}
          </span>
        </div>
        <span className="fine-card-amount">₱{Number(fine.totalFine || 0).toLocaleString()}</span>
      </header>

      <dl className="fine-card-meta">
        {fine.dueDate && (
          <div className="fine-card-row">
            <span className="fine-card-label">
              <MdCalendarToday size={13} /> Due
            </span>
            <span className="fine-card-value">{fmtDate(fine.dueDate)}</span>
          </div>
        )}
        <div className="fine-card-row">
          <span className="fine-card-label">
            <MdEventBusy size={13} /> Days overdue
          </span>
          <span className="fine-card-value">{fine.daysOverdue || 0}d</span>
        </div>
        {fine.returnedAt ? (
          <div className="fine-card-row">
            <span className="fine-card-label">
              <MdCheckCircle size={13} /> Returned
            </span>
            <span className="fine-card-value">{fmtDate(fine.returnedAt)}</span>
          </div>
        ) : (
          <div className="fine-card-row">
            <span className="fine-card-label">Return date</span>
            <span className="fine-card-value">{DASH}</span>
          </div>
        )}
      </dl>

      <span className="student-card-cta" aria-hidden="true">
        <MdVisibility size={14} /> View details
      </span>
    </article>
  );
}