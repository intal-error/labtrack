import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdMoreVert } from "react-icons/md";

/**
 * Row action menu for the attendance tables: a kebab trigger plus its popup,
 * rendered in a portal.
 *
 * WHY A PORTAL: the popup used to be absolutely positioned inside the table
 * wrapper, which is `overflow: auto` so rows can scroll. A `z-index` cannot escape
 * an ancestor's overflow, so the menu was clipped on any row near the bottom of
 * the visible area — putting Delete out of reach without a scroll. Rendering into
 * document.body at fixed coordinates sidesteps the clipping entirely.
 *
 * Split into its own component (rather than inlined in each table's row map) so
 * it can own a ref: hooks cannot be called inside a `.map()`, and the anchor has
 * to be a real node to measure.
 *
 * It also re-anchors on scroll/resize, so the menu tracks its trigger rather
 * than hanging in space if the table moves underneath it.
 *
 * @param {string}   label     accessible name, e.g. "Actions for Ann Aguilar"
 * @param {boolean}  open      whether this row's menu is the open one
 * @param {Function} onToggle  called when the trigger is activated
 * @param {Function} onClose   called on Escape or an outside click
 * @param {Node}     children  menu items; each should carry role="menuitem"
 */
export default function RowActions({ label, open, onToggle, onClose, children }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const MENU_W = 148;
    const MENU_H = 76; // two 36px rows plus padding
    const GAP = 4;

    // Prefer downwards; flip up when there is not room below.
    const below = window.innerHeight - rect.bottom - GAP;
    const top = below >= MENU_H ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - MENU_H);
    // Right-align with the trigger, clamped so it never leaves the viewport.
    const left = Math.min(Math.max(GAP, rect.right - MENU_W), window.innerWidth - MENU_W - GAP);

    setPos({ top, left });
  }, []);

  // Measured before paint so the menu never flashes at the wrong position.
  // Stale coordinates are intentionally NOT cleared when closing: the popup is
  // only rendered while `open` is true, and on reopen place() runs before the
  // browser paints, so a leftover value can never be shown. Clearing it here
  // would be a synchronous setState in an effect body, which react-hooks flags
  // as a cascading render.
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e) => {
      // Clicks on the trigger are left to onToggle, otherwise a click that both
      // closes and reopens the same row would leave it stuck open.
      if (menuRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose]);

  // Move focus into the menu so keyboard users are not stranded on the trigger.
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector("button")?.focus();
  }, [open, pos]);

  return (
    <>
      <div className="au-kebab" ref={triggerRef}>
        <button
          type="button"
          className="au-kebab-btn"
          // "menu" rather than the generic true: the popup does carry
          // role="menu" with role="menuitem" children, so this is now accurate.
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={onToggle}
        >
          <MdMoreVert size={17} />
        </button>
      </div>
      {open &&
        pos &&
        createPortal(
          <div className="au-kebab-menu" ref={menuRef} style={{ top: pos.top, left: pos.left }} role="menu" aria-label={label}>
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
