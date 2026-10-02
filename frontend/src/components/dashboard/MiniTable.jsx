import "./dashboard-widgets.css";

/**
 * Compact read-only table for dashboard drill-downs.
 * `columns`: [{ key, header, render?(row), clip?, width? }]
 * A `width` on any column emits a <colgroup>; combined with the fixed table
 * layout in dashboard-widgets.css that makes text ellipsize instead of forcing
 * the table wider than its (narrow) panel.
 */
export default function MiniTable({ columns, rows, empty = "Nothing to show yet" }) {
  if (!rows?.length) {
    return <div className="dash-table-empty">{empty}</div>;
  }

  const widths = columns.some((c) => c.width);

  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        {widths && (
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} title={typeof c.header === "string" ? c.header : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row.key || i}>
              {columns.map((c) => (
                <td key={c.key} className={c.clip ? "dash-cell-clip" : undefined}>
                  {c.render ? c.render(row, i) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
