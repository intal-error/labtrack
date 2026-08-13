import LoadingSpinner from "./LoadingSpinner";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

export default function TransactionTable({ columns, items, loading, renderRow, error, onRetry }) {
  if (loading) return <LoadingSpinner />;

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {error ? (
            <ErrorState colSpan={columns.length} message={error} onRetry={onRetry} />
          ) : items.length === 0 ? (
            <EmptyState colSpan={columns.length} message="No records found" />
          ) : (
            items.map((item) => renderRow(item))
          )}
        </tbody>
      </table>
    </div>
  );
}
