export default function PesoIcon({ size = 24, className = "" }) {
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      ₱
    </span>
  );
}
