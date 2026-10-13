/**
 * The shared Modal, and the Transaction Details dialog it hosts, on a phone.
 *
 * ── WHAT THIS IS AND IS NOT ───────────────────────────────────────────────────
 *
 * IS: the dismissal affordances a phone user needs (there is no Escape key), the focus
 * trap the close button has to live inside, and the presence of every transaction field
 * at narrow widths.
 *
 * IS NOT: a layout test. jsdom has no layout engine -- it computes no box sizes, so no
 * assertion here can prove a 390px-wide dialog stops overflowing. The overflow fixes are
 * CSS declarations; what is verifiable in jsdom is that the elements exist and are
 * reachable. The declarations themselves are pinned separately, by reading the
 * stylesheet text, in tests/mobileModalCss.verify.js -- which is honest about being a
 * source check and not pretend to be a rendering check.
 */

import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../src/components/ui/Modal";
import TransactionDetail from "../src/components/transactions/TransactionDetail";

/**
 * Waits for the frame in which Modal's open-focus effect runs.
 *
 * That effect moves focus inside a requestAnimationFrame, deliberately (focusing
 * synchronously can race the paint). jsdom does fire rAF, but not before a plain
 * synchronous assertion -- so an assertion written without this settles while nothing
 * is focused yet and would pass for the wrong reason.
 */
function nextFrame() {
  return act(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

/** A borrowed-tool record, matching the shape TransactionDetail consumes. */const VIEW = {
  id: "t1",
  fullName: "Marc Lawrence Intal",
  schoolId: "23-000039",
  email: "intalmarclawrence01604@gmail.com",
  course: "BSIT",
  year: "4th Year",
  equipmentCourse: "BIT",
  itemName: "Crimping Tool",
  role: "student",
  isBorrowed: true,
  remaining: 1,
  total: 1,
  borrowedAt: "2026-10-14T01:46:00.000Z",
  dueDate: "2026-10-21T05:00:00.000Z",
  returnedAt: "",
  conditionOnBorrow: "",
  conditionOnReturn: "",
  borrowPhotoURL: "",
  returnPhotoURL: "",
  raw: { status: "borrowed" },
};

describe("Modal: a phone can close it", () => {
  it("renders a visible, labelled close button", () => {
    render(
      <Modal title="Transaction Details" onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    );

    // THE regression: this button did not exist, so a phone user had only Escape
    // (which they do not have) or a sliver of backdrop to tap.
    const close = screen.getByRole("button", { name: /close dialog/i });
    expect(close).toBeInTheDocument();
    expect(close).toBeVisible();
  });

  it("closes when the button is pressed, calling onClose exactly once", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Transaction Details" onClose={onClose}>
        <p>body</p>
      </Modal>
    );

    await user.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is reachable and dismissible from the keyboard", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Transaction Details" onClose={onClose}>
        <button type="button">Save</button>
      </Modal>
    );

    // Let the open-focus effect's requestAnimationFrame run before tabbing, so this
    // asserts where focus STARTS and not merely that a tab eventually lands somewhere.
    await nextFrame();

    // The close button is the first focusable in the panel, so one Tab from the
    // content control reaches it -- and Enter activates it.
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalled();
  });

  it("sits INSIDE the dialog panel, so it is inside the focus trap", () => {
    render(
      <Modal title="Transaction Details" onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /close dialog/i })).toBeInTheDocument();
  });

  it("does not double-fire onClose when clicked (overlay handler is stopped)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Transaction Details" onClose={onClose}>
        <p>body</p>
      </Modal>
    );

    // The button is inside the panel, and the panel stops propagation. If that guard
    // were removed this would be 2, and the dialog would close and re-open handlers
    // twice on a phone tap.
    await user.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still dismisses with Escape and by clicking the backdrop", async () => {
    const onEscape = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <Modal title="A" onClose={onEscape}>
        <p>body</p>
      </Modal>
    );
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalled();
    unmount();

    const onBackdrop = vi.fn();
    render(
      <Modal title="B" onClose={onBackdrop}>
        <p>body</p>
      </Modal>
    );
    await user.click(document.querySelector(".modal-overlay"));
    expect(onBackdrop).toHaveBeenCalled();
  });

  /*
   * ── REGRESSION CAUSED BY ADDING THE CLOSE BUTTON ─────────────────────────────
   *
   * The close button renders FIRST inside the panel (so it can be absolutely
   * positioned into the corner). The open-focus effect picks the first match of
   * `input, select, button` in DOM order -- which, from the day the button was added,
   * is `.modal-close`.
   *
   * So every dialog began by focusing its DISMISS control instead of its content. On a
   * form dialog that is the one input the user must not be on: it invites dismissal,
   * and it is exactly the focus-steal this component's own comments describe as a bug
   * that was previously fixed for the waive-reason textarea.
   */
  it("moves focus to the first CONTROL, not to the close button", async () => {
    const { container } = render(
      <Modal title="Waive fine" onClose={vi.fn()}>
        <textarea aria-label="Reason" />
      </Modal>
    );

    // The open-focus move happens in a requestAnimationFrame, so the assertion has to
    // wait for that frame. Asserting on the NEGATIVE first (close is not focused) would
    // pass instantly, while nothing is focused yet, and would prove nothing.
    await nextFrame();
    expect(container.querySelector("textarea")).toBe(document.activeElement);
    expect(container.querySelector(".modal-close")).not.toBe(document.activeElement);
  });

  it("focuses the first BUTTON in the content, not the close button", async () => {
    const { container } = render(
      <Modal title="Transaction Details" onClose={vi.fn()}>
        <button type="button">Save</button>
      </Modal>
    );
    await nextFrame();
    expect(screen.getByRole("button", { name: "Save" })).toBe(document.activeElement);
    expect(container.querySelector(".modal-close")).not.toBe(document.activeElement);
  });

  it("falls back to the panel itself when the dialog has no controls", async () => {
    // With the close button present there is ALWAYS a button in the panel now, so a
    // content-free dialog must still focus the panel rather than the dismiss control.
    const { container } = render(
      <Modal title="Read only" onClose={vi.fn()}>
        <p>nothing to edit</p>
      </Modal>
    );
    await nextFrame();
    expect(container.querySelector(".modal-content")).toBe(document.activeElement);
    expect(container.querySelector(".modal-close")).not.toBe(document.activeElement);
  });
});

describe("TransactionDetail: every field survives a phone", () => {
  it("renders the heading, the borrower and all nine detail rows", () => {
    const { container } = render(<TransactionDetail view={VIEW} />);

    expect(screen.getByRole("heading", { name: /transaction details/i })).toBeInTheDocument();
    // Borrower block -- the long unbreakable strings that overflowed.
    expect(screen.getByText("Marc Lawrence Intal")).toBeInTheDocument();
    expect(screen.getByText("23-000039")).toBeInTheDocument();
    expect(screen.getByText("intalmarclawrence01604@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("BSIT - 4th Year")).toBeInTheDocument();

    /*
     * Scoped to `.txd-label`, because "Borrowed" is BOTH a row label and the Status
     * pill's value. A page-wide getByText would match two elements and tell us nothing
     * about whether the rows are present.
     */
    const labels = [...container.querySelectorAll(".txd-label")].map((el) => el.textContent);
    ["Item", "Equipment Course", "Quantity", "Status", "Borrowed", "Due Date", "Returned", "Condition (Borrow)", "Condition (Return)"].forEach(
      (label) => expect(labels).toContain(label)
    );
    expect(labels).toHaveLength(9);

    expect(screen.getByText("Crimping Tool")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    // The status pill, which is a `.tx-status`, not the row label of the same name.
    expect(container.querySelector(".tx-status").textContent).toBe("Borrowed");
  });

  it("renders a dash rather than an empty cell for missing values", () => {
    // The reported screenshot showed "—" for Returned and both Conditions; that must
    // stay true, and must not render as an empty span a screen reader skips.
    render(<TransactionDetail view={VIEW} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("shows a zero quantity as 0, not as a dash", () => {
    // `children || DASH` would swallow 0. Pinned because the Row helper exists
    // precisely to avoid that.
    render(<TransactionDetail view={{ ...VIEW, isBorrowed: false, remaining: 0, total: 0 }} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("the detail dialog is closable end to end", () => {
  it("opens and closes on a phone with a single tap", async () => {
    // The whole reported bug in one interaction: on a phone this dialog could not be
    // dismissed.
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>open</button>
          {open && (
            <Modal title="Transaction Details" onClose={() => setOpen(false)}>
              <TransactionDetail view={VIEW} />
            </Modal>
          )}
        </>
      );
    }

    render(<Harness />);
    // Scoped to the dialog's own title: TransactionDetail renders its own
    // "Transaction Details" <h5> inside the <h2>, so a bare getByText matches two.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2, name: /transaction details/i })).toBeInTheDocument();
    expect(within(dialog).getByText("Marc Lawrence Intal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});