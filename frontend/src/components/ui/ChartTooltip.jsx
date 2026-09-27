export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 4px 12px rgba(0,0,0,.1)",
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", fontSize: 12, color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}
