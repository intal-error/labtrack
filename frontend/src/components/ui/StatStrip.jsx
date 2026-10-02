import "./stat-strip.css";

// `variant="stack"` renders the compact label-over-value tile used by the
// catalog. It is opt-in so the other four call sites (TransactionsPage,
// AttendanceLogsPage, activity/TransactionsPanel) keep the icon-led layout.
export default function StatStrip({ items, variant }) {
  return (
    <div className={`stat-strip${variant ? ` stat-strip--${variant}` : ""}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`stat-strip-card${item.tone && item.tone !== "default" ? ` tone-${item.tone}` : ""}`}
        >
          {item.icon && <span className="stat-strip-icon">{item.icon}</span>}
          <div className="stat-strip-info">
            <span className="stat-strip-value">{item.value}</span>
            <span className="stat-strip-label">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
