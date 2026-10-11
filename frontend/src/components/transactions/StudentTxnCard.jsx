import { MdCalendarToday, MdCheckCircle, MdInventory2, MdSwapHoriz, MdVisibility } from "react-icons/md";
import { fmtDate, timeAgo } from "../../utils/helpers";
import "../../styles/pages/transactions-browser.css";

const DASH = "—";

/**
 * The STUDENT's own borrowed / returned record, as a card.
 *
 * WHY NOT TransactionCard
 * TransactionTable renders nine columns, four of which (Borrower, Course,
 * Equipment Course, and the duplicate Returned/Due pair) are meaningless when
 * the only borrower is the person reading the screen -- and the first thing the
 * table shows is a 46px avatar of the user themselves. So this is a separate
 * component rather than a prop on the shared one: the admin grid card and the
 * student grid card want genuinely different content, and merging them would
 * mean one of the two sets of fields becomes conditional noise.
 *
 * Nothing is dropped that the table carried. Item name, quantity, equipment
 * course (including the cross-course marker), borrowed date, due date, returned
 * date, the overdue badge and the open status are all here; they are just
 * stacked instead of laid out in columns.
 *
 * Rendered only below STUDENT_CARD_MAX_WIDTH -- see hooks/useMediaQuery.js. The
 * table is not rendered at the same time, so this is not a CSS-only restyle.
 */
export default function StudentTxnCard({ view, onSelect }) {
  const crossCourse = view.equipmentCourse && view.equipmentCourse !== view.course;

  return (
    <article
      className={`tx-card tx-card--${view.isBorrowed ? "borrowed" : "returned"}${view.overdue ? " tx-card--overdue" : ""}`}
      onClick={() => onSelect?.(view)}
      role="button"
      tabIndex={0}
      aria-label={`${view.itemName || "Item"} — ${view.isBorrowed ? "Borrowed" : "Returned"}`}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect?.(view);
      }}
    >
      <header className="tx-card-top">
        <span className="student-card-icon">
          <MdInventory2 size={18} />
        </span>
        <div className="tx-card-id">
          <h3 className="tx-card-name" title={view.itemName}>
            {view.itemName || DASH}
          </h3>
          <span className="tx-card-sub">{crossCourse ? view.equipmentCourse : view.course || DASH}</span>
        </div>
        {view.overdue ? (
          <span className={`tx-overdue ${view.overdue.className}`}>{view.overdue.text}</span>
        ) : (
          <span className={`tx-status ${view.isBorrowed ? "tx-status--borrowed" : "tx-status--returned"}`}>
            {view.isBorrowed ? "Borrowed" : "Returned"}
          </span>
        )}
      </header>

      <dl className="tx-card-meta">
        <div className="tx-card-meta-row">
          <dt>
            <MdSwapHoriz size={13} /> Qty
          </dt>
          <dd>
            {view.isBorrowed ? `${view.remaining} / ${view.total}` : view.total}
          </dd>
        </div>

        {view.borrowedAt && (
          <div className="tx-card-meta-row">
            <dt>Borrowed</dt>
            <dd title={fmtDate(view.borrowedAt)}>{timeAgo(view.borrowedAt)}</dd>
          </div>
        )}

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

        {crossCourse && (
          <div className="tx-card-meta-row">
            <dt>Equipment</dt>
            <dd className="tx-course--cross">{view.equipmentCourse}</dd>
          </div>
        )}
      </dl>

      {/* Mirrors the table's affordance so the detail modal stays discoverable
          once the table (and with it the row-click target) is gone. */}
      <span className="student-card-cta" aria-hidden="true">
        <MdVisibility size={14} /> View details
      </span>
    </article>
  );
}