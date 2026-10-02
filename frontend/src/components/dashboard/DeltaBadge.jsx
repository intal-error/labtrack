import { MdArrowUpward, MdArrowDownward, MdRemove } from "react-icons/md";
import "./dashboard-widgets.css";

/**
 * Signed change indicator for a period-over-period metric. Colour follows
 * direction, so a fall always reads red; pass `invert` for metrics where a rise
 * is bad (open incidents, overdue items) and the mapping flips.
 */
export default function DeltaBadge({ value, invert = false, caption }) {
  const delta = Number(value) || 0;
  const rising = delta > 0;
  const falling = delta < 0;
  const flat = delta === 0;

  // up = green, down = red. Without `invert`, a rise is green; with it, a rise
  // is red (more overdue is worse).
  const tone = flat ? "flat" : rising === invert ? "down" : "up";
  const Icon = rising ? MdArrowUpward : falling ? MdArrowDownward : MdRemove;

  return (
    <>
      <span className={`dash-delta ${tone}`}>
        <Icon size={12} />
        {Math.abs(delta)}
      </span>
      {caption && <span className="dash-delta-caption">{caption}</span>}
    </>
  );
}
