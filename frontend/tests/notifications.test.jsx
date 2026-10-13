/**
 * Notification response shapes and the unread badge.
 *
 * GET /api/notifications/user has TWO shapes and the frontend has to survive both:
 *
 *   - With a `page` or `limit` param the controller calls paginatedResponse() and
 *     returns `{ data: [...], pagination: { total, page, limit, ... } }`.
 *   - With neither, it returns a BARE ARRAY.
 *
 * Two bugs here were found by self-review rather than by a failing test, and both are
 * about picking the wrong half of that response:
 *
 *   1. DashboardLayout passed `response.data` into pickNotifications. On a bare array
 *      `arr.data` is `undefined`, so the dropdown rendered "No notifications yet"
 *      unconditionally. It now passes the response, which pickNotifications already
 *      accepts in either shape -- the same thing DashboardPage and NotificationsTab do.
 *
 *   2. useUnreadCount used to fetch the ENTIRE notification history on every app boot
 *      to count it client-side. It now asks for `unreadOnly=true&limit=1` and reads
 *      the exact total out of `pagination.total`, because the controller paginates the
 *      POST-FILTER list. These tests pin that, including the fallback for a backend
 *      that ignores the params.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const getMyNotifications = vi.fn();
const getCourses = vi.fn();
vi.mock("../src/services/api", () => ({
  api: {
    getMyNotifications: (...args) => getMyNotifications(...args),
    getCourses: (...args) => getCourses(...args),
  },
}));

const { pickNotifications, countUnread, useUnreadCount, useMyNotifications, useCourseOptions } =
  await import("../src/hooks/useQueries");

const NOTIF = (id, read) => ({ id, read, title: `t${id}`, message: `m${id}` });

/*
 * A fresh cache per TEST, created once.
 *
 * Two traps here, both hit while writing this file:
 *
 *   - `function wrapper() { const client = new QueryClient(); ... }` is the shape the
 *     react-query docs show and it is wrong: renderHook treats `wrapper` as a
 *     component, so React calls it on every render and each call builds a fresh
 *     cache. The query never settles against the client the consumer reads.
 *   - Hoisting a single module-level client fixes that but leaks the cache between
 *     tests -- `useUnreadCount` has a 60 s staleTime, so the second test reads the
 *     first test's count.
 *
 * So: rebuilt in beforeEach, and read through a variable rather than constructed
 * inside the component.
 */
let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("pickNotifications accepts both response shapes", () => {
  it("reads a bare array", () => {
    const rows = [NOTIF(1, false)];
    expect(pickNotifications(rows)).toEqual(rows);
  });

  it("reads a paginated envelope", () => {
    const rows = [NOTIF(1, false)];
    expect(pickNotifications({ data: rows, pagination: { total: 1 } })).toEqual(rows);
  });

  it("is empty for nothing at all", () => {
    expect(pickNotifications(undefined)).toEqual([]);
    expect(pickNotifications(null)).toEqual([]);
    expect(pickNotifications({})).toEqual([]);
  });

  it("THE REGRESSION: response.data on a bare array is undefined, not the rows", () => {
    // This is the exact expression DashboardLayout used to pass in. Documented as a
    // test so the shape trap stays visible.
    const rows = [NOTIF(1, false)];
    expect(pickNotifications(rows.data)).toEqual([]);
    expect(pickNotifications(rows)).toEqual(rows);
  });
});

describe("countUnread", () => {
  it("counts only unread", () => {
    expect(countUnread([NOTIF(1, false), NOTIF(2, true), NOTIF(3, false)])).toBe(2);
  });
});

describe("useUnreadCount", () => {
  it("asks for ONE unread row, not the whole history", async () => {
    getMyNotifications.mockResolvedValue({
      data: [NOTIF(1, false)],
      pagination: { total: 7, page: 1, limit: 1, totalPages: 7 },
    });

    const { result } = renderHook(() => useUnreadCount(), { wrapper });

    // The bounded request is the whole point of the change.
    expect(getMyNotifications).toHaveBeenCalledWith("unreadOnly=true&limit=1", expect.anything());

    await waitFor(() => expect(result.current).toBe(7));
  });

  it("reads the exact count from pagination.total rather than counting rows", async () => {
    // The endpoint paginates the POST-FILTER list, so total is the true unread count
    // even though only one row came back. Counting the row would report 1.
    getMyNotifications.mockResolvedValue({
      data: [NOTIF(1, false)],
      pagination: { total: 42 },
    });

    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(42));
  });

  it("falls back to counting rows when the backend returns a bare array", async () => {
    // An older or differently-configured backend that ignores the params entirely.
    getMyNotifications.mockResolvedValue([NOTIF(1, false), NOTIF(2, true), NOTIF(3, false)]);

    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("is zero before the response arrives, not undefined", async () => {
    getMyNotifications.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    expect(result.current).toBe(0);
  });
});

describe("useMyNotifications keeps its own shape handling", () => {
  it("passes params straight through so the caller chooses the shape", async () => {
    getMyNotifications.mockResolvedValue({ data: [], pagination: { total: 0 } });
    renderHook(() => useMyNotifications("limit=8"), { wrapper });
    await waitFor(() => expect(getMyNotifications).toHaveBeenCalledWith("limit=8", expect.anything()));
  });
});

describe("useCourseOptions is referentially stable", () => {
  // Not a cost question -- ~9 courses sort for free. It is that three pickers memoise
  // on `options`, and an unmemoized return handed them a new array AND a new wrapper
  // object every render, so none of those memos could ever hit.
  it("returns the same options array and the same wrapper across re-renders", async () => {
    getCourses.mockResolvedValue([
      { id: "BSIT", name: "Automotive", status: "active" },
      { id: "BSCS", name: "Computer Science", status: "active" },
    ]);

    const { result, rerender } = renderHook(() => useCourseOptions(), { wrapper });
    await waitFor(() => expect(result.current.options.length).toBe(2));

    const first = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(first);
    expect(result.current.options).toBe(first.options);
    // Sanity: the memo must not have frozen an empty list in place.
    expect(result.current.options.map((o) => o.value).sort()).toEqual(["BSCS", "BSIT"]);
  });
});