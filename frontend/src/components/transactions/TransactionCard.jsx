import { MdInventory2, MdCalendarToday, MdCheckCircle } from "react-icons/md";
import { getInitials, getAvatarColor, fmtDate } from "../../utils/helpers";
import "../../styles/pages/transactions-browser.css";

const DASH = "\u2014";

function Borrower({ view }) {
  if (view.profileURL) {
    return <img className="tx-avatar tx-avatar--lg" src={view.profileURL} alt="" loading="lazy" width="46" height="46" decoding="async" />;
  }
  return (
    <span className="tx-avatar tx-avatar--lg tx-avatar--initials" style={{ background: getAvatarColor(view.fullName) }}>
      {getInitials(view.fullName)}
    </span>
  );
}

/** Shared grid card for transactions and borrow requests. */
export default function TransactionCard({ view, onSelect }) {
  const pct = view.total > 0 ? Math.max(0, ((view.total - (view.remaining ?? 0)) / view.total) * 100) : 0;

  return (
    <article
      /* Both states get an explicit modifier rather than borrowed falling back
         to the .tx-card default — the dark-mode amber override keys off
         tx-card--borrowed, so it only applies if the class is actually emitted.
         --overdue comes last so it wins when a borrowed loan is also late. */
      className={`tx-card tx-card--${view.isBorrowed ? "borrowed" : "returned"}${view.overdue ? " tx-card--overdue" : ""}`}
      onClick={() => onSelect?.(view)}
    >
      <header className="tx-card-top">
        <Borrower view={view} />
        <div className="tx-card-id">
          <h3 className="tx-card-name" title={view.fullName}>
            {view.fullName || DASH}
          </h3>
          <span className="tx-card-sub">{view.schoolId || DASH}</span>
        </div>
        {view.overdue && <span className={`tx-overdue ${view.overdue.className}`}>{view.overdue.text}</span>}
      </header>

      <div className="tx-card-item">
        <MdInventory2 size={15} />
        <span title={view.itemName}>{view.itemName || DASH}</span>
      </div>

      <dl className="tx-card-meta">
        {view.course && (
          <div className="tx-card-meta-row">
            <dt>Course</dt>
            <dd>
              {view.course}
              {view.year ? ` · ${view.year}` : ""}
            </dd>
          </div>
        )}
        {view.equipmentCourse && view.equipmentCourse !== view.course && (
          <div className="tx-card-meta-row">
            <dt>Equipment</dt>
            <dd className="tx-course--cross">{view.equipmentCourse}</dd>
          </div>
        )}
        <div className="tx-card-meta-row">
          <dt>Qty</dt>
          <dd>
            {view.isBorrowed ? `${view.remaining} / ${view.total}` : view.total}
          </dd>
        </div>
        {view.isBorrowed && view.dueDate && (
          <div className="tx-card-meta-row">
            <dt>
              <MdCalendarToday size={13} /> Due
            </dt>
            <dd className={view.overdue ? "tx-due--overdue" : ""}>{fmtDate(view.dueDate)}</dd>
          </div>
        )}
        {!view.isBorrowed && view.returnedAt && (
          <div className="tx-card-meta-row">
            <dt>
              <MdCheckCircle size={13} /> Returned
            </dt>
            <dd>{fmtDate(view.returnedAt)}</dd>
          </div>
        )}
      </dl>

      {view.isBorrowed && view.total > 0 && (
        <div className="tx-card-progress">
          <span className="tx-card-progress-bar">
            <span className="tx-card-progress-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="tx-card-progress-label">
            {Math.max(0, view.total - view.remaining)} of {view.total} returned
          </span>
        </div>
      )}
    </article>
  );
}