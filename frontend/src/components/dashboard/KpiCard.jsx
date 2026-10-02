import DeltaBadge from "./DeltaBadge";
import "./dashboard-widgets.css";

/**
 * Single headline metric tile: icon, label, value, and either a sub-line or a
 * signed delta versus the previous period.
 */
export default function KpiCard({
  icon: Icon,
  tone = "green",
  label,
  value,
  sub,
  delta,
  deltaInvert = false,
  deltaCaption,
  period = false,
}) {
  return (
    <div className={`dash-kpi${period ? " is-period" : ""}`}>
      <span className={`dash-kpi-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-kpi-value">{value}</span>
        {sub && <span className="dash-kpi-sub">{sub}</span>}
        {delta !== undefined && delta !== null && (
          <DeltaBadge value={delta} invert={deltaInvert} caption={deltaCaption} />
        )}
      </div>
    </div>
  );
}
