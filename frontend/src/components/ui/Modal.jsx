import { useEffect, useId, useRef } from "react";
import { MdClose } from "react-icons/md";
import "../../styles/pages/modal.css";

/**
 * Dialog shell shared by the export dialog, the QR viewer and the edit-record
 * dialog.
 *
 * Adds the things a dialog needs to be usable, none of which this had before:
 *   · role="dialog" + aria-modal, so assistive tech announces it as a dialog
 *   · Escape to dismiss
 *   · a visible close button
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

  /*
   * WHY onClose IS HELD IN A REF
   *
   * This effect previously depended on [onClose]. Every call site passes an inline
   * arrow -- `onClose={() => setShowModal(false)}` -- so that function is a new
   * identity on every parent render, and the effect re-ran each time. Re-running it
   * is not harmless here: it re-attaches the keydown listener, re-writes
   * document.body.style.overflow, and RE-FIRES the requestAnimationFrame focus
   * call below.
   *
   * The visible symptom: type one character in a dialog that contains an input --
   * FinesTab's waive-reason textarea is the clearest case -- the component
   * re-renders, the effect re-runs, and focus jumps out of the textarea mid-word.
   *
   * A ref gives the handler the current callback without making it a dependency,
   * which is the same pattern useRowMenu.js already uses correctly. The effect now
   * runs exactly once per mount, which is what "set up on open, tear down on close"
   * was always supposed to mean.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    restoreTo.current = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
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
    //
    // `.modal-close` IS EXCLUDED, and it has to be. The close button is the first
    // child of the panel so it can sit in the corner, which makes it the first match
    // of this selector -- so without the exclusion every dialog focused its own
    // DISMISS control on open. On a form dialog that is the one thing the user must
    // not be on: it invites closing the dialog by pressing Enter, and it reintroduces
    // the exact focus-steal the note at the top of this file describes having already
    // fixed for FinesTab's waive-reason textarea.
    //
    // The fallback is the panel itself, which is focusable (tabIndex={-1}), so a
    // content-free dialog still gets a sensible focus target.
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector(
        "input:not(.modal-close), select:not(.modal-close), textarea:not(.modal-close), button:not(.modal-close)"
      );
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
    // Mount/unmount only. onClose is read through onCloseRef precisely so it does
    // not have to appear here -- see the note above.
  }, []);

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
        {/*
         * The close button.
         *
         * WHY IT HAD TO BE ADDED: until now a dialog could only be dismissed with the
         * Escape key or by clicking the overlay. On a phone neither works well --
         * there is no Escape key, and a dialog sized near the viewport leaves only a
         * sliver of overlay to tap, which is easy to miss and easy to hit by accident.
         * The Transaction Details dialog was effectively undismissable on a phone short
         * of swiping or reloading. All 12 call sites get it.
         *
         * It is a real <button>, so it is reachable by Tab and activated by Enter or
         * Space for free. It sits inside the panel (the overlay click handler is
         * stopped here), so clicking it does not also fire onClose twice.
         *
         * It calls onCloseRef rather than onClose for the same reason the keydown
         * handler does -- see the note above. A bare onClick closure would be a new
         * identity per render, which is harmless here (there is no effect to re-run),
         * but the ref keeps the one dismissal path in the file single-sourced.
         */}
        <button type="button" className="modal-close" onClick={() => onCloseRef.current()} aria-label="Close dialog">
          <MdClose size={20} />
        </button>
        {title && (
          <h2 id={titleId}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
