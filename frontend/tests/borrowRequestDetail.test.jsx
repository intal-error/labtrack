/**
 * BorrowRequestsTab: the open detail dialog reflects the current list.
 *
 * ── THE BUG ──────────────────────────────────────────────────────────────────
 *
 * `selectedRequest` / `reassignTarget` held the ROW OBJECT captured when the user
 * clicked. Every mutation then called `invalidateBorrowRequests()`, which refetches --
 * but nothing re-derived the held object, so the dialog kept rendering the values it
 * was opened with. The reported symptom was Borrow Request Details continuing to show
 * the PREVIOUS assigned admin immediately after a successful reassign, while the row
 * behind the dialog had already changed.
 *
 * The fix stores only the id and derives the row from `requests` on every render, so
 * there is no second copy to go stale.
 *
 * ── WHY THIS IS A COMPONENT TEST ──────────────────────────────────────────────
 *
 * The bug lived in the wiring between state and the query cache, not in any function.
 * A test of a helper would have passed against the broken component, exactly as an
 * isolated `pickNotifications` test did for the notification bug on this same codebase.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const reassignBorrowRequest = vi.fn();
const getMyBorrowRequests = vi.fn();

vi.mock("../src/services/api", () => ({
  api: {
    reassignBorrowRequest: (...a) => reassignBorrowRequest(...a),
    getMyBorrowRequests: (...a) => getMyBorrowRequests(...a),
  },
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ isSuperAdmin: true, isCourseAdmin: false, courseId: null, courseName: null, role: "admin" }),
}));

let currentRows = [];

vi.mock("../src/hooks/useQueries", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useBorrowRequests: () => ({ data: currentRows, isLoading: false }),
    useCatalogPreview: () => ({ data: [] }),
    useActiveAdmins: () => ({
      data: [
        { id: "a1", firstName: "Ana", lastName: "Reyes" },
        { id: "a2", firstName: "Ben", lastName: "Bautista" },
      ],
    }),
  };
});

const { default: BorrowRequestsTab } = await import("../src/components/tabs/BorrowRequestsTab");

const REQ = (over = {}) => ({
  id: "r1",
  firstName: "Marc",
  lastName: "Intal",
  schoolId: "23-000039",
  course: "BIT",
  year: "4th Year",
  itemName: "Crimping Tool",
  quantity: 1,
  dueDate: "2026-10-21T05:00:00.000Z",
  purpose: "Test",
  status: "pending",
  targetCourse: "BIT",
  equipment_course: "BIT",
  assigned_admin_id: "a1",
  assigned_admin_name: "Ana Reyes",
  reassignment_history: [],
  createdAt: "2026-10-01T05:00:00.000Z",
  ...over,
});

/* One client for the file: rebuilt per test so a 60s staleTime cannot leak between
   cases. See the same note in notifications.test.jsx. */
let client;
function tree() {
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BorrowRequestsTab />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** Re-renders the mounted tree, which is what an invalidate-triggered refetch does. */
function renderTab() {
  const utils = render(tree());
  rerenderTab = () => utils.rerender(tree());
  return utils;
}
let rerenderTab = () => {};

async function openDetail(user) {
  await user.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  currentRows = [REQ()];
});

describe("BorrowRequestsTab: the detail dialog follows the list", () => {
  it("shows the assigned admin from the current row", async () => {
    const user = userEvent.setup();
    renderTab();
    await openDetail(user);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ana Reyes")).toBeInTheDocument();
  });

  it("THE REGRESSION: an open dialog updates when the refetched row changes", async () => {
    const user = userEvent.setup();
    renderTab();
    await openDetail(user);

    expect(within(screen.getByRole("dialog")).getByText("Ana Reyes")).toBeInTheDocument();

    /*
     * This is exactly what `invalidateBorrowRequests()` delivers after a successful
     * reassign: the same row, re-fetched, with a different `assigned_admin_name`.
     *
     * With the id-only state the open dialog re-derives and shows the new name. With
     * the captured row object it keeps showing "Ana Reyes" -- which is the bug.
     *
     * Simulated by handing the hook a new array and re-rendering, rather than driving
     * the reassign form: this is a test about how the dialog READS the list, and the
     * reassign form opens a SECOND dialog on top, which would make every query here
     * ambiguous.
     */
    currentRows = [REQ({ assigned_admin_id: "a2", assigned_admin_name: "Ben Bautista" })];
    rerenderTab();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ben Bautista")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ana Reyes")).toBeNull();
  });

  it("follows a status change too, not just the admin name", async () => {
    // Same defect, different column: prove the derivation is over the whole row rather
    // than a targeted patch of the one field that was reported.
    const user = userEvent.setup();
    renderTab();
    await openDetail(user);

    currentRows = [REQ({ status: "approved", assigned_admin_name: "Ben Bautista" })];
    rerenderTab();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Approved")).toBeInTheDocument();
    expect(within(dialog).getByText("Ben Bautista")).toBeInTheDocument();
  });

  it("closes the dialog when the row leaves the list, instead of showing a phantom", async () => {
    const user = userEvent.setup();
    renderTab();
    await openDetail(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The request drops out of the current page/filter, as it does when a reassign
    // moves it and the filter no longer matches. A captured object would keep it on
    // screen; the derived row becomes null and the modal closes.
    currentRows = [];
    rerenderTab();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("only ever renders a row that is in the list", async () => {
    const user = userEvent.setup();
    currentRows = [REQ({ id: "r1" }), REQ({ id: "r2", itemName: "Oscilloscope", assigned_admin_name: "Ben Bautista" })];
    renderTab();

    // Two rows, so two "Review" buttons. Scope to r1's row explicitly.
    const reviewButtons = screen.getAllByRole("button", { name: "Review" });
    await user.click(reviewButtons[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(within(screen.getByRole("dialog")).getByText("Ana Reyes")).toBeInTheDocument();

    // The list is reordered, so a positional lookup would now resolve to r2 and show
    // the WRONG admin. Resolving by id keeps r1 open with its own admin.
    currentRows = [REQ({ id: "r2", itemName: "Oscilloscope", assigned_admin_name: "Ben Bautista" }), REQ({ id: "r1" })];
    rerenderTab();

    expect(within(screen.getByRole("dialog")).getByText("Ana Reyes")).toBeInTheDocument();
  });
});