import "./feedback.css";

export default function EmptyChart({ text = "No data for this period" }) {
  return (
    <div className="empty-chart" role="status">
      {text}
    </div>
  );
}
