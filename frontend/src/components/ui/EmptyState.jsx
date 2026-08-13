export default function EmptyState({ colSpan = 6, message = "No data found" }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-state">{message}</td>
    </tr>
  );
}
