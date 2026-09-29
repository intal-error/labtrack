import "./stat-strip.css";

export default function StatStrip({ items }) {
  return (
    <div className="stat-strip">
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
