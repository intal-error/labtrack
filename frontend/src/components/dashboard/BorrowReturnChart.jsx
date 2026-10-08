import { memo } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "../ui/ChartTooltip";

/**
 * Borrow & return volume area chart.
 *
 * WHY THIS IS ITS OWN FILE: recharts is 401 kB minified. It used to be a static
 * import in DashboardPage.jsx, and because a static import forces a static
 * chunk edge, that put the whole charting library in the /dashboard route graph.
 * /dashboard is where IndexRedirect sends every user, so every student downloaded
 * 401 kB of charting library to render a KPI grid and an empty-state list -- no
 * student view contains a chart. Splitting the component means recharts is only
 * reached through a dynamic import, so the vendor chunk is fetched when an admin
 * actually sees a chart, and never otherwise.
 *
 * The chart body (grid, axes, two areas, legend) is deliberately byte-identical
 * to what DashboardPage rendered inline; only its location changed.
 */

// Recharts re-renders its whole tree when any prop is a new object, and this
// panel re-renders on every KPI/date-range change. memo + primitive props stop
// the chart from being torn down and rebuilt each time.
function BorrowReturnChart({ data }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="borrowed"
            name="Borrows"
            stroke="#2e7d32"
            fill="#2e7d32"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="returned"
            name="Returns"
            stroke="#1976d2"
            fill="#1976d2"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="dash-chart-legend">
        <span className="dash-legend-item">
          <span className="dash-legend-dot" style={{ background: "#2e7d32" }} />
          Borrows
        </span>
        <span className="dash-legend-item">
          <span className="dash-legend-dot" style={{ background: "#1976d2" }} />
          Returns
        </span>
      </div>
    </>
  );
}

export default memo(BorrowReturnChart);