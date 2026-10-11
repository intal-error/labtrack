import { MdAssignment, MdCalendarToday, MdSchedule } from "react-icons/md";
import { fmtDate, timeAgo } from "../../utils/helpers";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE } from "../../constants/requests";
import "../../styles/pages/transactions-browser.css";

const DASH = "—";

/**
 * The student's own borrow REQUESTS as a card.
 *
 * RequestsTable renders eight columns that need ~900px to stay legible
 * (transactions-browser.css:801 sets `.tx-table{min-width:900px}` at <=768px).
 * This is the same data stacked.
 *
 * The status pill reuses the exact `.tx-req-status--*` tone mapping the table
 * uses, so a request is never a different colour in the two layouts, and the
 * "View" affordance calls the same `onView` the table's View button calls --
 * which opens the same modal holding the same Cancel action.
 */
export default function StudentRequestCard({ request, onView }) {
  const crossCourse = request.equipment_course && request.course && request.equipment_course !== request.course;

  return (
    <article className="tx-card tx-card--request">
      <header className="tx-card-top">
        <span className="student-card-icon student-card-icon--blue">
          <MdAssignment size={18} />
        </span>
        <div className="tx-card-id">
          <h3 className="tx-card-name" title={request.itemName}>
            {request.itemName || DASH}
          </h3>
          <span className="tx-card-sub">{request.equipment_course || request.course || DASH}</span>
        </div>
        <span className={`tx-req-status tx-req-status--${REQUEST_STATUS_TONE[request.status] || "muted"}`}>
          {REQUEST_STATUS_LABELS[request.status] || request.status || DASH}
        </span>
      </header>

      <dl className="tx-card-meta">
        <div className="tx-card-meta-row">
          <dt>Qty</dt>
          <dd>{request.quantity ?? 0}</dd>
        </div>
        {request.dueDate && (
          <div className="tx-card-meta-row">
            <dt>
              <MdCalendarToday size={13} /> Due
            </dt>
            <dd>{fmtDate(request.dueDate)}</dd>
          </div>
        )}
        {request.createdAt && (
          <div className="tx-card-meta-row">
            <dt>
              <MdSchedule size={13} /> Submitted
            </dt>
            <dd title={fmtDate(request.createdAt)}>{timeAgo(request.createdAt)}</dd>
          </div>
        )}
        {crossCourse && (
          <div className="tx-card-meta-row">
            <dt>Equipment</dt>
            <dd className="tx-course--cross">{request.equipment_course}</dd>
          </div>
        )}
      </dl>

      {request.purpose && <p className="student-card-note">{request.purpose}</p>}

      <button
        type="button"
        className="student-card-action"
        onClick={(e) => {
          e.stopPropagation();
          onView?.(request);
        }}
      >
        View details
      </button>
    </article>
  );
}