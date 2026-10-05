import DeltaBadge from "./DeltaBadge";
import "./dashboard-widgets.css";

/**
 * Single headline metric tile: icon, label, value, and an optional signed delta
 * versus the previous period.
 */
export default function KpiCard({
  icon: Icon,
  tone = "green",
  label,
  value,
  delta,
  deltaInvert = false,
  deltaCaption,
}) {
  return (
    <div className="dash-kpi">
      <span className={`dash-kpi-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-kpi-value">{value}</span>
        {delta !== undefined && delta !== null && (
          <DeltaBadge value={delta} invert={deltaInvert} caption={deltaCaption} />
        )}
      </div>
    </div>
  );
}
