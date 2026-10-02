import { getInitials, getAvatarColor, fmtDate, timeAgo } from "../../utils/helpers";
import "../../styles/pages/transactions-browser.css";

const DASH = "\u2014";

function Borrower({ view }) {
  if (view.profileURL) {
    return <img className="tx-avatar" src={view.profileURL} alt="" loading="lazy" width="34" height="34" decoding="async" />;
  }
  return (
    <span className="tx-avatar tx-avatar--initials" style={{ background: getAvatarColor(view.fullName) }}>
      {getInitials(view.fullName)}
    </span>
  );
}

function StatusCell({ view }) {
  return (
    <span className={`tx-status ${view.isBorrowed ? "tx-status--borrowed" : "tx-status--returned"}`}>
      {view.isBorrowed ? "Borrowed" : (view.raw.status || "Returned")}
    </span>
  );
}

/**
 * Shared list view for transactions and borrow requests.
 *
 * `.tx-*` only. The legacy `.transactions-table` / `.transaction-card` classes
 * in tables.css are still rendered by RequestsPanel and MaintenanceTab, so they
 * are deliberately not touched here.
 */
export default function TransactionTable({ rows, onSelect, showReturnedColumn = true }) {
  return (
    <div className="tx-table-wrap">
      <table className="tx-table">
        <thead>
          <tr>
            <th className="tx-th-borrower">Borrower</th>
            <th>Course</th>
            <th>Item</th>
            <th className="tx-th-qty">Qty</th>
            <th>Equipment Course</th>
            <th>Borrowed</th>
            <th>Due</th>
            {showReturnedColumn && <th>Returned</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((view) => (
            <tr key={view.id} onClick={() => onSelect?.(view)} className="tx-row">
              <td>
                <div className="tx-borrower">
                  <Borrower view={view} />
                  <div className="tx-borrower-text">
                    <span className="tx-borrower-name" title={view.fullName}>
                      {view.fullName || DASH}
                    </span>
                    <span className="tx-borrower-sub">{view.schoolId || DASH}</span>
                  </div>
                </div>
              </td>
              <td>
                {view.course ? (
                  <span className="tx-course">
                    {view.course}
                    {view.year ? <span className="tx-course-year">{view.year}</span> : null}
                  </span>
                ) : (
                  <span className="tx-none">{DASH}</span>
                )}
              </td>
              <td>
                <span className="tx-item" title={view.itemName}>
                  {view.itemName || DASH}
                </span>
              </td>
              <td className="tx-td-qty">
                {view.isBorrowed ? (
                  <span className="tx-qty">
                    {view.remaining} <span className="tx-qty-sep">/</span> {view.total}
                  </span>
                ) : (
                  <span className="tx-qty">{view.total}</span>
                )}
              </td>
              <td>
                {view.equipmentCourse ? (
                  <span className={view.equipmentCourse !== view.course ? "tx-course tx-course--cross" : "tx-course"}>
                    {view.equipmentCourse}
                  </span>
                ) : (
                  <span className="tx-none">{DASH}</span>
                )}
              </td>
              <td>{view.borrowedAt ? <span title={fmtDate(view.borrowedAt)}>{timeAgo(view.borrowedAt)}</span> : <span className="tx-none">{DASH}</span>}</td>
              <td>
                {view.dueDate ? (
                  <span className={view.overdue ? "tx-due tx-due--overdue" : "tx-due"}>
                    {view.overdue ? `${fmtDate(view.dueDate)} (${view.overdue.text})` : fmtDate(view.dueDate)}
                  </span>
                ) : (
                  <span className="tx-none">{DASH}</span>
                )}
              </td>
              {showReturnedColumn && (
                <td>{view.returnedAt ? fmtDate(view.returnedAt) : <span className="tx-none">{DASH}</span>}</td>
              )}
              <td>
                <div className="tx-status-cell">
                  {view.overdue && <span className={`tx-overdue ${view.overdue.className}`}>{view.overdue.text}</span>}
                  <StatusCell view={view} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}