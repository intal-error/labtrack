import { useState, useEffect } from "react";
import { MdViewList, MdViewModule } from "react-icons/md";
import "../../styles/pages/view-toggle.css";

export default function ViewToggle({ value, onChange, localStorageKey }) {
  const [mode, setMode] = useState(() => {
    if (localStorageKey) {
      const saved = localStorage.getItem(localStorageKey);
      if (saved === "list" || saved === "grid") return saved;
    }
    return value || "list";
  });

  useEffect(() => {
    if (localStorageKey) localStorage.setItem(localStorageKey, mode);
  }, [mode, localStorageKey]);

  useEffect(() => {
    if (value !== undefined && value !== mode) setMode(value);
  }, [value]);

  const toggle = (newMode) => {
    setMode(newMode);
    onChange?.(newMode);
  };

  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn ${mode === "list" ? "active" : ""}`}
        onClick={() => toggle("list")}
        title="List View"
      >
        <MdViewList size={16} /> List
      </button>
      <button
        className={`view-toggle-btn ${mode === "grid" ? "active" : ""}`}
        onClick={() => toggle("grid")}
        title="Grid View"
      >
        <MdViewModule size={16} /> Grid
      </button>
    </div>
  );
}
