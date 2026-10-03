import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Open/close state for a table row's action popup, with the dismissal behaviour
 * that is easy to forget and annoying to miss: click-away and Escape.
 *
 * Shared by the two attendance tables so neither has to re-implement the same
 * document listeners. `containerClass` is the popup's own wrapper class — the
 * outside-click test measures against it so a click that lands on the trigger
 * button (inside the wrapper) does not close and immediately reopen.
 *
 * `onEscape` lets the caller hang extra cleanup off the same Escape key, e.g.
 * abandoning an open edit dialog. It is held in a ref so passing an inline
 * arrow function does not tear down and re-add the listener on every render.
 */
export default function useRowMenu({ containerClass, onEscape }) {
  const [openId, setOpenId] = useState(null);

  const escapeRef = useRef(onEscape);
  // Written in an effect, not during render — updating a ref while rendering is
  // flagged by react-hooks/refs and is unsafe under concurrent rendering.
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  const close = useCallback(() => setOpenId(null), []);
  const toggle = useCallback((id) => setOpenId((current) => (current === id ? null : id)), []);

  // Escape is ALWAYS live, not just while a menu is open. It used to share the
  // openId gate with the outside-click handler, which meant that opening the
  // edit dialog -- which closes the menu first -- left no keydown listener at
  // all and Escape silently did nothing.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpenId(null);
      escapeRef.current?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Outside-click only matters while a menu is actually open.
  useEffect(() => {
    if (openId == null) return undefined;

    const onMouseDown = (event) => {
      if (!event.target.closest(`.${containerClass}`)) setOpenId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openId, containerClass]);

  return [openId, { toggle, close }];
}
