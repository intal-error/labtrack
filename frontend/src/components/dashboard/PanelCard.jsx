import { useNavigate } from "react-router-dom";
import { MdArrowForward } from "react-icons/md";
import "./dashboard-widgets.css";

/**
 * Titled card used for every dashboard widget. `span` widens it inside the
 * 3-column grid (2 = two columns, 3 = full width). `actionTo` renders a
 * "View all" link that routes; pass `action` for a custom control instead.
 */
export default function PanelCard({
  icon: Icon,
  title,
  action,
  actionTo,
  actionLabel = "View all",
  span,
  children,
}) {
  const navigate = useNavigate();
  const spanClass = span === 2 ? " span2" : span === 3 ? " span3" : "";

  return (
    <section className={`dash-panel${spanClass}`}>
      <div className="dash-panel-header">
        <h3>
          {Icon && <Icon size={18} />}
          <span className="dash-panel-title-text">{title}</span>
        </h3>
        {actionTo && (
          <button className="dash-panel-link" onClick={() => navigate(actionTo)}>
            {actionLabel} <MdArrowForward size={13} />
          </button>
        )}
        {action}
      </div>
      <div className="dash-panel-body">{children}</div>
    </section>
  );
}
