import { MdRefresh } from "react-icons/md";
import "./feedback.css";

export default function LoadError({ message = "Failed to load data", onRetry }) {
  return (
    <div className="load-error" role="alert">
      <span className="load-error-icon">⚠</span>
      <div className="load-error-body">
        <p className="load-error-message">{message}</p>
        {onRetry && (
          <button type="button" className="load-error-retry" onClick={onRetry}>
            <MdRefresh size={14} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
