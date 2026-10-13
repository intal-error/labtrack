/**
 * The header notification dropdown, rendered.
 *
 * ── WHY THIS TEST EXISTS AND WHY IT IS A COMPONENT TEST ───────────────────────
 *
 * The dropdown shipped broken: the badge counted 1 while the list said "No
 * notifications yet", for every user, on every page load. The cause was one line --
 * `pickNotifications` was handed the react-query RESULT instead of the response
 * inside it, so `Array.isArray(raw)` and `Array.isArray(raw.data)` were both false and
 * it returned `[]` unconditionally.
 *
 * An earlier suite tested `pickNotifications` in isolation against hand-built response
 * objects and passed the whole time. That is the trap: the function was correct and the
 * CALLER was wrong, and a unit test of the function cannot see a caller. The same blind
 * spot let a dead `useMemo` dependency through twice on this codebase.
 *
 * So this file renders the real thing and asserts on what a user would see.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const NOTIF = (id, { read = false, title = "Notice", message = "Body" } = {}) => ({
  id,
  read,
  title,
  message,
  created_at: "2026-01-02T10:00:00.000Z",
});

/*
 * The endpoint's two real shapes, exactly as notificationsController.getAll returns
 * them: a paginated envelope when a page/limit param is present, a BARE ARRAY when it
 * is not.
 */
const PAGINATED = {
  data: [NOTIF("n1", { title: "Borrow approved", message: "Crimping Tool is yours" })],
  pagination: { page: 1, limit: 8, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
};
const BARE_ARRAY = [NOTIF("n1", { title: "Borrow approved", message: "Crimping Tool is yours" })];

/* ── Mocks: only what DashboardLayout reaches for ─────────────────────────── */

const useMyNotifications = vi.fn();
const useUnreadCount = vi.fn();
const useStudentAttendance = vi.fn();

vi.mock("../src/hooks/useQueries", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMyNotifications: (...a) => useMyNotifications(...a),
    useUnreadCount: (...a) => useUnreadCount(...a),
    useStudentAttendance: (...a) => useStudentAttendance(...a),
  };
});

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    role: "admin",
    isSuperAdmin: true,
    isCourseAdmin: false,
    courseName: null,
    courseId: null,
    userProfile: null,
    logout: vi.fn(),
    profileError: null,
    refreshProfile: vi.fn(),
    loading: false,
  }),
}));

vi.mock("../src/services/api", () => ({ api: { markAllNotificationsRead: vi.fn() } }));
vi.mock("../src/utils/prefetchRoute", () => ({ prefetchRoute: vi.fn(), prefetchRouteOnFocus: vi.fn() }));

/* The layout reads the theme for its own dark-mode chrome. Mocked rather than wrapped
   in the real provider: nothing about the notification list depends on the theme, and
   ThemeProvider reads localStorage and matchMedia at mount. */
vi.mock("../src/context/ThemeContext", () => ({
  useTheme: () => ({ dark: true, toggleTheme: vi.fn() }),
}));

const { default: DashboardLayout } = await import("../src/components/layout/DashboardLayout");

function renderLayout() {
  // MemoryRouter, because the layout navigates on every notification click.
  return render(
    <MemoryRouter>
      <DashboardLayout />
    </MemoryRouter>
  );
}

async function openDropdown(user) {
  await user.click(screen.getByTitle("Notifications"));
}

beforeEach(() => {
  vi.clearAllMocks();
  // The list query: DashboardLayout asks for 8.
  useMyNotifications.mockReturnValue({ data: PAGINATED, isPending: false });
  useUnreadCount.mockReturnValue(1);
  useStudentAttendance.mockReturnValue({ data: null });
});

describe("notification dropdown: the list actually renders", () => {
  it("THE REGRESSION: shows the notification, not 'No notifications yet'", async () => {
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    // THE assertion that would have caught it. With `pickNotifications(queryResult)`,
    // `notifications` is [] and the empty state renders instead.
    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());
    expect(screen.getByText("Crimping Tool is yours")).toBeInTheDocument();

    expect(screen.queryByText("No notifications yet")).toBeNull();
  });

  it("still renders when the endpoint answers with a bare array", async () => {
    // The other real shape. `pickNotifications` handles both, and the caller must hand
    // it the response -- which is `.data` of the query result in either case.
    useMyNotifications.mockReturnValue({ data: BARE_ARRAY, isPending: false });
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());
  });

  it("reads .data off the query result -- the exact shape the bug got wrong", async () => {
    // Stated as a shape contract so a future refactor cannot reintroduce the mismatch
    // by accident, whichever way the component is destructured.
    useMyNotifications.mockReturnValue({
      // The FULL query result, as the hook actually returns it. Anything that forgets
      // to unwrap `.data` here sees a `data` that is the envelope, not the rows.
      data: PAGINATED,
      isPending: false,
      isFetching: false,
      error: null,
      status: "success",
    });
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());
  });

  it("marks unread rows so they are distinguishable", async () => {
    useMyNotifications.mockReturnValue({
      data: { data: [NOTIF("n1"), NOTIF("n2", { read: true })], pagination: { total: 2 } },
      isPending: false,
    });
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    const unread = document.querySelector(".dash-dd-item.unread");
    expect(unread).not.toBeNull();
    expect(unread.textContent).toContain("Notice");
    // The second row was read, so it must NOT carry the unread marker.
    expect(document.querySelectorAll(".dash-dd-item.unread")).toHaveLength(1);
  });
});

describe("notification dropdown: loading is not empty", () => {
  it("says it is loading rather than claiming there are none", async () => {
    // `notifications.length === 0` is true while the query is in flight, so the
    // dropdown used to say "No notifications yet" on every open that outran the network.
    useMyNotifications.mockReturnValue({ data: undefined, isPending: true });
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText(/loading notifications/i)).toBeInTheDocument());
    expect(screen.queryByText("No notifications yet")).toBeNull();
  });

  it("shows the empty state once loading finishes with nothing", async () => {
    useMyNotifications.mockReturnValue({ data: { data: [], pagination: { total: 0 } }, isPending: false });
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText("No notifications yet")).toBeInTheDocument());
  });
});

describe("notification dropdown: the badge and the list agree", () => {
  it("renders the unread count on the bell and in the header", async () => {
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    // "Mark all read" only appears when there is something unread.
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument();
  });

  it("does not offer 'Mark all read' at zero, but still lists what is there", async () => {
    // Everything read. The list is NOT empty (the beforeEach payload has one row) --
    // a read notification still exists, it just should not offer the bulk action.
    // Asserting the empty state here would have been wrong on both counts.
    useUnreadCount.mockReturnValue(0);
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);

    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /mark all read/i })).toBeNull();
  });

  it("opens the dropdown without issuing a different notification request", async () => {
    const user = userEvent.setup();
    renderLayout();
    await openDropdown(user);
    await waitFor(() => expect(screen.getByText("Borrow approved")).toBeInTheDocument());

    /*
     * On the ARGUMENTS, not the raw call count.
     *
     * The mock records one call per render, and the layout re-renders when the
     * dropdown opens -- so a count of 2 is a property of the harness, not of the app.
     * What actually matters is that there is exactly ONE distinct query: the count of
     * distinct argument tuples. Two different argument sets would be two cache keys and
     * therefore two network requests for overlapping data, which is what "no duplicate
     * requests" has to mean here.
     */
    const distinctQueries = new Set(useMyNotifications.mock.calls.map((call) => String(call[0])));
    expect([...distinctQueries]).toEqual(["limit=8"]);

    // And the list is fetched by the layout shell, not by opening the dropdown:
    // the hook is already called on mount, before any click.
    expect(useMyNotifications).toHaveBeenCalledWith("limit=8");
  });
});