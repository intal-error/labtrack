import { useState, useEffect } from "react";
import { MdViewList, MdViewModule } from "react-icons/md";
import "../../styles/pages/view-toggle.css";

export default function ViewToggle({ value, onChange, localStorageKey, hide = false }) {
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

  const [prevValue, setPrevValue] = useState(() => Symbol("init"));
  if (prevValue !== value) {
    setPrevValue(value);
    if (value !== undefined) setMode(value);
  }

  const toggle = (newMode) => {
    setMode(newMode);
    onChange?.(newMode);
  };

  /*
   * `hide` is used when the CALLER has forced a layout for a given width -- the
   * catalog and the student transaction panels swap the table for cards below
   * their breakpoint, and a toggle that could switch back to a layout which does
   * not fit the viewport would hand the user a clipped screen. Default false, so
   * every existing call site renders exactly as before.
   */
  if (hide) return null;

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
