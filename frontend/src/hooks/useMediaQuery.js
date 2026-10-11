import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 *
 * WHY A HOOK AND NOT TWO SETS OF MARKUP
 *
 * The list surfaces (transactions, requests, fines, catalog) render a wide
 * table on desktop and a card list on narrow viewports. Doing that with CSS
 * `display:none` means both subtrees are built on every render and the hidden
 * one is still paid for -- and on some configurations still exposed to screen
 * readers. Deciding in JS means exactly one layout is mounted.
 *
 * That is the pattern AttendancePanel already used inline
 * (pages/activity/AttendancePanel.jsx, the `isNarrow` matchMedia block); this
 * is that same code, hoisted so all five call sites share one implementation
 * and one breakpoint constant.
 *
 * matchMedia is read once for the initial render and then kept in sync through
 * its own change event, so a rotation, a window resize or a browser window
 * dragged across the breakpoint switches layouts with no reload and no polling.
 *
 * `query` is expected to be a STABLE string for the lifetime of the component.
 * Every call site passes a literal or a template built from the exported
 * STUDENT_CARD_MAX_WIDTH constant, so the string never actually changes -- but
 * if one did, the effect would re-subscribe without re-reading the new value,
 * and `matches` would stay stale until the next genuine change event. Passing a
 * value derived from props or state would need a re-read here.
 *
 * @param {string} query  any media query, e.g. "(max-width: 900px)"
 * @returns {boolean}     true while the query matches
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;

    const mq = window.matchMedia(query);
    /* Subscribe only. The initial value already came from the same live
       matchMedia via the useState initializer above, and that initializer runs
       at this component's first render -- so re-reading here would set the same
       value back and buy nothing. The effect's whole job is the subscription:
       without it a rotation or a window resize would leave the layout frozen
       until a full reload. */
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * The shared width at which the student list surfaces switch from table to card.
 *
 * WHY 900px AND NOT 768px
 *
 * The student transaction table needs ~900px to render its columns legibly
 * (transactions-browser.css:801 sets `.tx-table{min-width:900px}` at <=768px),
 * and the catalog table is floored at 820px (catalog-browser.css:564 at
 * <=1024px). Measured against the real content box at an 820px viewport --
 * 820 - 32px of .main-content padding - that is ~788px, less than either floor.
 * So a 768px card breakpoint would leave every 769-950px tablet swiping a
 * desktop table sideways, which is exactly the "compressed desktop site" feel
 * this work is meant to remove.
 *
 * This is deliberately NOT the same number as the stat-card breakpoint (768px).
 * They are independent axes: a stat strip is a short row of compact tiles that
 * fits comfortably on an 820px tablet and is only clutter on a phone, whereas a
 * 9-column table does not fit anywhere below ~950px. See .hide-stats-mobile in
 * stat-strip.css for the other one.
 */
export const STUDENT_CARD_MAX_WIDTH = 900;