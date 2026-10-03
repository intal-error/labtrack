import { useMemo } from "react";

// Accepts either plain strings or ready-made {value, label} pairs.
const toOption = (o) => (typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label });

export default function FilterSelect({ label, value, onChange, options }) {
  // Normalised HERE, not at each call site. These option lists mix a labelled
  // "All X" object with a spread of plain strings from the *_CATEGORIES /
  // *_STATUSES constants, and spreading does not convert:
  // `[{value,label}, ...["Available"]]` leaves the tail as strings, so reading
  // `o.label` gave undefined and React rendered every real option as a blank
  // row — the Status/Category/Condition dropdowns looked empty. Normalising
  // inside the component makes that mismatch unrepresentable.
  const normalized = useMemo(() => options.map(toOption), [options]);

  return (
    <select
      className="cx-select"
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}