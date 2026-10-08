import "./stat-strip.css";

// `variant="stack"` renders the compact label-over-value tile used by the
// catalog, inventory and attendance-logs pages. It is opt-in so the two
// call sites that still want the icon-led layout (TransactionsPage and
// activity/TransactionsPanel) are unaffected.
//
// `onSelect` makes the tiles behave as a single-select filter group: each item
// needs a `key`, the matching one gets `activeKey`, and the tile renders as a
// real <button> with aria-pressed. Without `onSelect` the markup is unchanged
// (a plain div), so the read-only KPI strips elsewhere cannot regress.
// Memoised. Every one of the eight call sites builds a fresh `items` array inline
// (and often fresh icon elements) on every parent render, so without memo this strip
// re-rendered whenever its parent did -- for a handful of numbers that rarely change.
// The parent-side arrays would need stabilising to get real value out of this; the
// memo is what makes that the next step rather than a re-render every time.
import { memo } from "react";

function StatStrip({ items, variant, onSelect, activeKey }) {
  const interactive = typeof onSelect === "function";

  return (
    <div className={`stat-strip${variant ? ` stat-strip--${variant}` : ""}`}>
      {items.map((item) => {
        const active = interactive && item.key !== undefined && item.key === activeKey;
        const classes = `stat-strip-card${item.tone && item.tone !== "default" ? ` tone-${item.tone}` : ""}${interactive ? " is-clickable" : ""}${active ? " is-active" : ""}`;

        const body = (
          <>
            {item.icon && <span className="stat-strip-icon">{item.icon}</span>}
            <div className="stat-strip-info">
              <span className="stat-strip-value">{item.value}</span>
              <span className="stat-strip-label">{item.label}</span>
            </div>
          </>
        );

        if (!interactive) {
          return (
            <div key={item.label} className={classes}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={item.key ?? item.label}
            type="button"
            className={classes}
            aria-pressed={active}
            onClick={() => onSelect(item.key)}
          >
            {body}
          </button>
        );
})}
    </div>
  );
}

// `items` is compared by reference, which is the shallow default. That is correct
// here: every call site passes a newly-built array, so an unchanged reference really
// does mean nothing changed, and a deep-compare would cost more than the render it
// saved.
export default memo(StatStrip);
