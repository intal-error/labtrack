export default function EmptyState({ colSpan = 6, message = "No data found" }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: "center", color: "#888", padding: "20px" }}>
        {message}
      </td>
    </tr>
  );
}
