export default function ErrorState({ message = "Failed to load data", onRetry, colSpan = 6 }) {
  return (
    <tr>
      <td colSpan={colSpan} className="error-state">
        <div className="error-state-icon">⚠</div>
        <p className="error-state-message">{message}</p>
        {onRetry && <button type="button" className="btn btn-green" onClick={onRetry}>Retry</button>}
      </td>
    </tr>
  );
}
