import { useEffect, useId, useRef } from "react";

/**
 * Dialog shell shared by the export dialog, the QR viewer and the edit-record
 * dialog.
 *
 * Adds the four things a dialog needs to be usable without a mouse, none of which
 * this had before:
 *   · role="dialog" + aria-modal, so assistive tech announces it as a dialog
 *   · Escape to dismiss
 *   · focus moved in on open, and restored to the trigger on close
 *   · Tab cycling kept inside, so it cannot tab out onto the inert page behind
 */
export default function Modal({ title, onClose, children, wide }) {
  const panelRef = useRef(null);
  // Unique per instance, so two dialogs can never collide on the same id.
  const titleId = useId();
  // What had focus before this dialog opened; restored on close so keyboard
  // users are not dumped at the top of the document.
  const restoreTo = useRef(null);

  useEffect(() => {
    restoreTo.current = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Cycle focus within the panel so Tab cannot reach the page behind.
      const focusables = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    // Move focus in. requestAnimationFrame because the panel is mounted in the
    // same tick; focusing synchronously can race the paint on some browsers.
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector("input, select, button");
      (target || panelRef.current)?.focus();
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      // Restore the inline value rather than hardcoding "auto": it may have been
      // "hidden" for an unrelated reason before this dialog opened.
      document.body.style.overflow = previousOverflow;
      const target = restoreTo.current;
      if (target && typeof target.focus === "function") target.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${wide ? "qr-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        // Without a label the dialog is announced as just "dialog".
        aria-label={title ? undefined : "Dialog"}
        aria-labelledby={title ? titleId : undefined}
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2 id={titleId}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
