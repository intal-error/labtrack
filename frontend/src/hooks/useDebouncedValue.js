import { useEffect, useState } from "react";

/**
 * Mirrors `value` after it has stopped changing for `delay` ms.
 *
 * Used by the room attendance history search box. That endpoint does a
 * `.select("*")` on the whole lab_attendance table and filters in JS on the
 * server, so every keystroke was a full-table scan — a 10-character student
 * name fired 10 scans. Debouncing collapses that to one request per settled
 * query without changing what the user sees.
 *
 * `resetKey` discards any pending debounce immediately and re-seeds from the
 * CURRENT `value`. The room history page passes `roomId`: switching rooms clears
 * the search box, and without this the term typed for the previous room stayed
 * live for the full delay, so the new room's first request was filtered by it.
 *
 * `delay = 0` passes the value straight through, so a caller can opt out.
 */
export default function useDebouncedValue(value, delay = 300, resetKey) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  // Discard a pending debounce the moment `resetKey` changes. Done during render
  // rather than in an effect: React's documented "adjust state when a prop
  // changes" pattern re-renders immediately without committing, whereas a
  // setState inside an effect body is a cascading render (react-hooks flags it
  // as set-state-in-effect). The mirror makes this fire once per key change.
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setDebounced(value);
  }

  // Pass straight through when debouncing is switched off. Returning `value`
  // rather than relying on the 0ms timer avoids a one-tick lag, and keeps the
  // setState out of the effect body (which the react-hooks lint rule flags as a
  // cascading render).
  return delay > 0 ? debounced : value;
}
