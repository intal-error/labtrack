import { getInitials, getAvatarColor, fmtDateTime } from "../../utils/helpers";
import "../../styles/pages/transactions-browser.css";

const DASH = "\u2014";

function Row({ label, children }) {
  return (
    <div className="txd-row">
      <span className="txd-label">{label}</span>
      {/* Explicit empty checks rather than `children || DASH`: several callers
          pass "" for a missing date/condition (which should show the dash), but
          Quantity legitimately renders the number 0, and `||` would swallow it. */}
      <span className="txd-value">{children === "" || children === null || children === undefined ? DASH : children}</span>
    </div>
  );
}

/**
 * Modal body for a single transaction. Previously duplicated: inline as an IIFE
 * in TransactionsPage and as a local component in TransactionsPanel.
 */
export default function TransactionDetail({ view }) {
  // Guard the composed modifier: an unexpected role would otherwise produce
  // txd-tag--<value> with no matching rule, i.e. an unstyled tag.
  const roleTone = ["student", "faculty", "admin"].includes(view.role) ? view.role : "muted";

  const avatar = view.profileURL ? (
    <img className="txd-avatar-img" src={view.profileURL} alt="" loading="lazy" width="56" height="56" decoding="async" />
  ) : (
    <span className="txd-avatar-initials" style={{ background: getAvatarColor(view.fullName) }}>
      {getInitials(view.fullName)}
    </span>
  );

  return (
    <div className="txd">
      <div className="txd-borrower">
        <span className="txd-avatar">{avatar}</span>
        <div className="txd-borrower-text">
          <h4>{view.fullName || DASH}</h4>
          <p>{view.schoolId || DASH}</p>
          <div className="txd-tags">
            {view.course && (
              <span className="txd-tag">
                {view.course}
                {view.year ? ` - ${view.year}` : ""}
              </span>
            )}
            {view.email && <span className="txd-tag txd-tag--muted">{view.email}</span>}
            {view.role && <span className={`txd-tag txd-tag--role txd-tag--${roleTone}`}>{view.role}</span>}
          </div>
        </div>
      </div>

      <section className="txd-section">
        <h5>Transaction Details</h5>
        <Row label="Item">{view.itemName}</Row>
        {view.equipmentCourse && (
          <Row label="Equipment Course">
            {view.equipmentCourse}
            {view.equipmentCourse !== view.course && <span className="tx-course--cross"> (Cross-course)</span>}
          </Row>
        )}
        <Row label="Quantity">{view.isBorrowed ? `${view.remaining} / ${view.total}` : view.total}</Row>
        <Row label="Status">
          <span className={`tx-status ${view.isBorrowed ? "tx-status--borrowed" : "tx-status--returned"}`}>
            {view.isBorrowed ? "Borrowed" : (view.raw.status || "Returned")}
          </span>
        </Row>
        <Row label="Borrowed">{view.borrowedAt ? fmtDateTime(view.borrowedAt) : ""}</Row>
        <Row label="Due Date">{view.dueDate ? fmtDateTime(view.dueDate) : ""}</Row>
        <Row label="Returned">{view.returnedAt ? fmtDateTime(view.returnedAt) : ""}</Row>
        <Row label="Condition (Borrow)">{view.conditionOnBorrow}</Row>
        <Row label="Condition (Return)">{view.conditionOnReturn}</Row>
      </section>

      {(view.borrowPhotoURL || view.returnPhotoURL) && (
        <section className="txd-section">
          <h5>Condition Photos</h5>
          <div className="txd-photos">
            {view.borrowPhotoURL && (
              <figure>
                <img src={view.borrowPhotoURL} alt="Condition at borrow" loading="lazy" width="200" height="200" decoding="async" />
                <figcaption>At Borrow</figcaption>
              </figure>
            )}
            {view.returnPhotoURL && (
              <figure>
                <img src={view.returnPhotoURL} alt="Condition at return" loading="lazy" width="200" height="200" decoding="async" />
                <figcaption>At Return</figcaption>
              </figure>
            )}
          </div>
        </section>
      )}
    </div>
  );
}