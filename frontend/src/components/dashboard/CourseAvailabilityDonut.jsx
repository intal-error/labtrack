import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import ChartTooltip from "../ui/ChartTooltip";
import EmptyChart from "../ui/EmptyChart";
import "./dashboard-widgets.css";

/* Course slices are ordered by how many items each course has available, so the
   colour cannot come from the row index — the same course would change colour
   whenever a rival course overtook it. The caller passes a name → hex map that
   is built from the fixed course list instead; these are only the last-resort
   ramp for a course code the map does not know about, so an unexpected value
   still renders as a distinct visible slice rather than inheriting a
   neighbour's colour. */
const FALLBACK_COLORS = [
  "#00897b",
  "#7b1fa2",
  "#ef6c00",
  "#c2185b",
  "#455a64",
  "#5d4037",
  "#303f9f",
  "#9e9d24",
];

const colorFor = (name, index, colorMap) =>
  colorMap[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

/**
 * One slice per course, sized by how many of that course's items are available.
 * `total` is the figure the centre label summarises; the caller derives it from
 * these same rows, so it normally equals the slice sum.
 */
export default function CourseAvailabilityDonut({
  data,
  total,
  totalLabel = "Total",
  colorMap = {},
  emptyText = "No available equipment",
}) {
  const rows = (data || []).filter((d) => d.value > 0);
  if (rows.length === 0) {
    return <EmptyChart text={emptyText} />;
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
                <Cell key={d.name} fill={colorFor(d.name, i, colorMap)} />
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
              style={{ background: colorFor(d.name, i, colorMap) }}
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
