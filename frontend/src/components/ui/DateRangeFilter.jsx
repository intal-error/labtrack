import { useState } from "react";
import { RANGE_PRESETS } from "./dateRange";
import "./date-range-filter.css";

export default function DateRangeFilter({ value, onChange }) {
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const applyCustom = (nextFrom, nextTo) => {
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    onChange?.({ preset: "custom", from: nextFrom, to: nextTo });
  };

  const applyPreset = (preset) => {
    setDraftFrom("");
    setDraftTo("");
    onChange?.({ preset, from: "", to: "" });
  };

  const isCustom = value?.preset === "custom";
  const from = isCustom ? value.from : draftFrom;
  const to = isCustom ? value.to : draftTo;

  return (
    <div className="date-range-filter">
      <div className="date-range-presets" role="group" aria-label="Date range presets">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`date-range-preset${value?.preset === p.key ? " active" : ""}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="date-range-custom">
        <input
          type="date"
          aria-label="From date"
          value={from}
          max={to || undefined}
          onChange={(e) => applyCustom(e.target.value, to)}
        />
        <span className="date-range-sep">to</span>
        <input
          type="date"
          aria-label="To date"
          value={to}
          min={from || undefined}
          onChange={(e) => applyCustom(from, e.target.value)}
        />
      </div>
    </div>
  );
}
