import { fmtDate, timeAgo } from "../../utils/helpers";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE } from "../../constants/requests";
import "../../styles/pages/transactions-browser.css";

const DASH = "\u2014";

/**
 * Borrow-request rows. Deliberately its own component rather than
 * TransactionTable: a request has no borrower avatar, no returned/due pair and
 * a purpose field, so forcing it into the transaction shape would invent data.
 *
 * Previously this table borrowed .catalog-table from catalog.css, which meant an
 * unrelated screen silently depended on the catalog stylesheet.
 */
export default function RequestsTable({ requests, onSelect, onView }) {
  return (
    <div className="tx-table-wrap">
      <table className="tx-table">
        <thead>
          <tr>
            <th className="tx-th-item">Item</th>
            <th className="tx-th-qty">Qty</th>
            <th>Equipment Course</th>
            <th>Due</th>
            <th>Submitted</th>
            <th>Purpose</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req.id} className="tx-row" onClick={() => onSelect?.(req)}>
              <td>
                <span className="tx-item" title={req.itemName}>
                  {req.itemName || DASH}
                </span>
              </td>
              <td className="tx-td-qty">
                <span className="tx-qty">{req.quantity ?? 0}</span>
              </td>
              <td>
                {req.equipment_course ? (
                  <span className={req.equipment_course !== req.course ? "tx-course tx-course--cross" : "tx-course"}>
                    {req.equipment_course}
                  </span>
                ) : (
                  <span className="tx-none">{DASH}</span>
                )}
              </td>
              <td>{req.dueDate ? fmtDate(req.dueDate) : <span className="tx-none">{DASH}</span>}</td>
              <td>{req.createdAt ? timeAgo(req.createdAt) : <span className="tx-none">{DASH}</span>}</td>
              <td>
                <span className="tx-purpose" title={req.purpose}>
                  {req.purpose || DASH}
                </span>
              </td>
              <td>
                <span className={`tx-req-status tx-req-status--${REQUEST_STATUS_TONE[req.status] || "muted"}`}>
                  {REQUEST_STATUS_LABELS[req.status] || req.status || DASH}
                </span>
              </td>
              <td className="tx-td-actions">
                <button
                  type="button"
                  className="tx-view-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView?.(req);
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}