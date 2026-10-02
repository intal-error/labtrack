import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import ChartTooltip from "../ui/ChartTooltip";
import EmptyChart from "../ui/EmptyChart";
import "./dashboard-widgets.css";

/* Statuses that carry meaning get a fixed colour; anything unexpected in the
   data falls back to the neutral ramp so a new state never renders invisible. */
const STATUS_COLORS = {
  Available: "#43a047",
  "In Use": "#42a5f5",
  "Under Maintenance": "#f9a825",
  "Out of Service": "#e53935",
};
const FALLBACK_COLORS = ["#00897b", "#7b1fa2", "#ef6c00", "#5d4037", "#1976d2"];

const colorFor = (name, index) =>
  STATUS_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

export default function StatusDonut({ data, total, totalLabel = "Total" }) {
  const rows = (data || []).filter((d) => d.value > 0);
  if (rows.length === 0) {
    return <EmptyChart text="No equipment data" />;
  }

  const sum = rows.reduce((acc, d) => acc + d.value, 0);
  const center = total ?? sum;

  return (
    <div className="dash-donut">
      <div className="dash-donut-plot">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={82}
              paddingAngle={2}
              strokeWidth={0}
            >
              {rows.map((d, i) => (
                <Cell key={d.name} fill={colorFor(d.name, i)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-donut-center">
          <strong>{center}</strong>
          <span>{totalLabel}</span>
        </div>
      </div>

      <ul className="dash-donut-legend">
        {rows.map((d, i) => (
          <li key={d.name}>
            <span
              className="dash-donut-dot"
              style={{ background: colorFor(d.name, i) }}
            />
            <span className="dash-donut-name">{d.name}</span>
            <span className="dash-donut-value">{d.value}</span>
            <span className="dash-donut-pct">
              {Math.round((d.value / sum) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
