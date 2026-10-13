/**
 * AttendanceScanner's recent-logbook panel.
 *
 * These tests exist because of one specific defect introduced when that panel was
 * moved from a local `useState` + `useEffect` fetch onto `useStudentAttendance`:
 *
 *   useStudentAttendance is `enabled: !!schoolId`, and in react-query v5 a DISABLED
 *   query remains in `pending` status forever. Aliasing `isPending` straight to the
 *   spinner flag therefore produced an infinite loader for any profile with no
 *   schoolId -- and the pre-existing code had an explicit guard for exactly that case,
 *   which the refactor dropped.
 *
 * The second thing pinned here is that a FAILED fetch is reported as a failure rather
 * than as an empty logbook. "No entries yet. Scan a room QR to get started" after a
 * timeout tells a student their history is empty, which is a different and wrong
 * statement.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useStudentAttendance = vi.fn();
const useAuth = vi.fn();

vi.mock("../src/hooks/useQueries", () => ({
  useStudentAttendance: (...args) => useStudentAttendance(...args),
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuth(),
}));

/* html5-qrcode pulls in a camera stack jsdom cannot load; the camera is not what
   these tests are about. */
vi.mock("../src/components/scanner/ScannerCamera", () => ({
  default: () => <div data-testid="camera" />,
}));

const { default: AttendanceScanner } = await import("../src/pages/components/AttendanceScanner");

function mockAttendance({ data, isPending = false, isError = false } = {}) {
  useStudentAttendance.mockReturnValue({
    data,
    isPending,
    isError,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The scanner is a student surface; the profile shape is what varies per test.
  useAuth.mockReturnValue({
    userProfile: { id: "u1", schoolId: "2026-0001", firstName: "Ana", lastName: "Reyes" },
    role: "student",
  });
});

describe("AttendanceScanner: recent logbook loading state", () => {
  it("shows the loader only while a real fetch is in flight", () => {
    mockAttendance({ isPending: true });
    render(<AttendanceScanner />);
    expect(document.querySelector(".logbook-recent-loading")).not.toBeNull();
  });

  it("does NOT spin forever when the profile has no schoolId", () => {
    // THE REGRESSION. A disabled react-query query stays `pending` forever, so
    // `isPending` alone means "loading" for the life of the page here.
    mockAttendance({ isPending: true });
    useAuth.mockReturnValue({
      userProfile: { id: "u1", firstName: "Ana", lastName: "Reyes" },
      role: "student",
    });

    render(<AttendanceScanner />);

    expect(document.querySelector(".logbook-recent-loading")).toBeNull();
    expect(screen.getByText(/no school ID/i)).toBeInTheDocument();
  });

  it("reports a failed fetch instead of claiming an empty logbook", () => {
    mockAttendance({ isError: true });
    render(<AttendanceScanner />);

    expect(document.querySelector(".logbook-recent-loading")).toBeNull();
    expect(screen.getByText(/couldn'?t load your logbook/i)).toBeInTheDocument();
    expect(screen.queryByText(/no entries yet/i)).toBeNull();
  });

  it("shows a genuinely empty logbook when there are no records", () => {
    mockAttendance({ data: { records: [] } });
    render(<AttendanceScanner />);

    expect(screen.getByText(/no entries yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn'?t load your logbook/i)).toBeNull();
  });

  it("keeps the existing records visible when a background refetch fails", () => {
    mockAttendance({
      data: { records: [{ id: "r1", labRoom: "Lab 1", status: "active", date: "2026-01-02" }] },
      isError: true,
    });
    render(<AttendanceScanner />);

    expect(screen.queryByText(/couldn'?t load your logbook/i)).toBeNull();
    expect(screen.getByText("Lab 1")).toBeInTheDocument();
  });
});