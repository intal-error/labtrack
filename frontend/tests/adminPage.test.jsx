import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The admin-management UI's security boundary.
 *
 * WHY THIS EXISTS. Every privilege decision is enforced on the server: adminController
 * refuses a Course Admin's attempt to deactivate a peer, and middleware/auth.js refuses
 * a deactivated account's request regardless of what the UI offered. This suite is not
 * testing that again.
 *
 * It pins the half a user actually sees, which is where three real defects were:
 *
 *   1. "Edit" was rendered only on the caller's OWN row. adminController.update has
 *      accepted `isSelf || callerIsSuper` since a fix that explicitly went out of its
 *      way to make Super-Admin-on-anyone reachable -- so the Super Admin could edit no
 *      Course Admin at all from the UI, and reassignment (the one admin operation only
 *      they may perform) was still dead code. The backend comment claimed this had been
 *      fixed; the frontend never caught up.
 *
 *   2. "Deactivate"/"Activate" rendered on every row including the caller's own, which
 *      adminController answers with 400 "Cannot deactivate your own account". A Course
 *      Admin's only ever row is their own, so their only two kebab actions both always
 *      failed -- which reads as a broken app rather than as a boundary.
 *
 *   3. The edit payload never carried courseId, so even once (1) was fixed there was no
 *      way to move a Course Admin to another course. backend/adminController.js:207
 *      permits it for a super caller; the client simply never asked.
 *
 * Positive controls throughout: a suite that only asserts absence passes just as
 * happily against a component that renders nothing at all.
 */

const apiMock = vi.hoisted(() => ({
  getAdmins: vi.fn(),
  createAdmin: vi.fn(),
  updateAdmin: vi.fn(),
  deleteAdmin: vi.fn(),
  toggleAdminStatus: vi.fn(),
}));

vi.mock("../src/services/api", () => ({ api: apiMock }));

const authState = vi.hoisted(() => ({ current: {} }));
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => authState.current }));

vi.mock("../src/hooks/useQueries", () => ({
  useCourseOptions: () => ({ options: [{ value: "CT", label: "Computer Technology" }, { value: "MT", label: "Mechanical Technology" }] }),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toastMock }));

import AdminPage from "../src/pages/AdminPage";

const SUPER = "u-super";
const CT_ADMIN = "u-admin-ct";

const SUPER_PROFILE = { id: SUPER, role: "admin", adminLevel: "super", isSuperAdmin: true, courseId: null };
const CT_PROFILE = { id: CT_ADMIN, role: "admin", adminLevel: "course", isSuperAdmin: false, courseId: "CT" };

const ROSTER = [
  { id: SUPER, firstName: "Eve", lastName: "Santos", email: "eve@slsu.edu.ph", status: "active", adminLevel: "super" },
  { id: CT_ADMIN, firstName: "Cara", lastName: "Lim", email: "cara@slsu.edu.ph", status: "active", adminLevel: "course", courseId: "CT" },
];

const asSuperAdmin = () => { authState.current = { userProfile: SUPER_PROFILE, isSuperAdmin: true }; };
const asCourseAdmin = () => { authState.current = { userProfile: CT_PROFILE, isSuperAdmin: false }; };

/** Fields by position: the <label>s are not associated with their inputs (no htmlFor/id). */
const field = (container, i) => container.querySelectorAll("input")[i];
const submit = (container) => container.querySelector(".lab-form-submit-btn");
const courseSelect = (container) => container.querySelector("select");

/**
 * Accessible names for the two landing cards.
 *
 * "Create Account" alone is ambiguous: the slide-over is always mounted (it is closed
 * with a CSS class, not unmounted), so its submit button shares the label. The cards'
 * description text is unique, so it disambiguates without reaching into class names.
 */
const CREATE_CARD = /Add new admin or staff/i;
const LIST_CARD = /View all admin accounts/i;

async function openList() {
  const utils = render(<AdminPage />);
  await userEvent.click(screen.getByRole("button", { name: LIST_CARD }));
  await waitFor(() => expect(screen.getByText("cara@slsu.edu.ph")).toBeInTheDocument());
  return utils;
}

/** Opens the per-row kebab on the row whose email matches. */
async function openKebab(email) {
  const row = screen.getByText(email).closest("tr");
  await userEvent.click(within(row).getByRole("button"));
  return row;
}

/** Opens the create slide-over from the landing card. */
async function openCreateForm() {
  await userEvent.click(screen.getByRole("button", { name: CREATE_CARD }));
  return screen.getByRole("heading", { name: /Create Account/i }).closest(".lab-slide-panel");
}

beforeEach(() => {
  apiMock.getAdmins.mockResolvedValue(ROSTER);
  apiMock.toggleAdminStatus.mockResolvedValue({ status: "inactive" });
  apiMock.deleteAdmin.mockResolvedValue({});
  apiMock.updateAdmin.mockResolvedValue({});
  vi.stubGlobal("confirm", () => true);
});

describe("AdminPage — who is offered what", () => {
  it("offers account creation to the Super Admin", async () => {
    asSuperAdmin();
    render(<AdminPage />);
    expect(screen.getByRole("button", { name: CREATE_CARD })).toBeInTheDocument();
  });

  it("hides account creation from a Course Admin", async () => {
    asCourseAdmin();
    render(<AdminPage />);
    expect(screen.queryByRole("button", { name: CREATE_CARD })).not.toBeInTheDocument();
    // POSITIVE CONTROL: the page still rendered.
    expect(screen.getByRole("button", { name: LIST_CARD })).toBeInTheDocument();
  });

  it("titles the list 'Your Account' for a Course Admin, not 'Account List'", async () => {
    asCourseAdmin();
    apiMock.getAdmins.mockResolvedValue([ROSTER[1]]);
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("button", { name: LIST_CARD }));
    expect(await screen.findByRole("heading", { name: /Your Account/i })).toBeInTheDocument();
  });

  it("does not offer an Add button in the list header to a Course Admin", async () => {
    asCourseAdmin();
    apiMock.getAdmins.mockResolvedValue([ROSTER[1]]);
    await openList();
    expect(screen.queryByRole("button", { name: /^Add$/i })).not.toBeInTheDocument();
  });
});

describe("AdminPage — the Super Admin can act on a Course Admin", () => {
  it("offers Edit on another admin's row (reassignment is Super-Admin-only server-side)", async () => {
    asSuperAdmin();
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");
    expect(within(row).getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("does NOT offer Edit on another admin's row to a Course Admin", async () => {
    asCourseAdmin();
    // The backend's getAll returns only the caller's own row for a non-Super Admin, so
    // this row cannot appear in practice. Asserted anyway: the row menu is driven by
    // whatever the API returns, and a future change that widened getAll must not
    // silently widen the menu with it.
    await openList();
    const row = await openKebab("eve@slsu.edu.ph");
    // adminController.update answers a non-self, non-super caller with 403.
    expect(within(row).queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("sends courseId on a Super Admin edit, which is the only reassignment path", async () => {
    asSuperAdmin();
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");
    await userEvent.click(within(row).getByRole("button", { name: /Edit/i }));

    const panel = screen.getByRole("heading", { name: /Edit Account/i }).closest(".lab-slide-panel");
    await userEvent.selectOptions(courseSelect(panel), "MT");
    await userEvent.click(submit(panel));

    await waitFor(() => expect(apiMock.updateAdmin).toHaveBeenCalled());
    expect(apiMock.updateAdmin.mock.calls[0][1]).toHaveProperty("courseId", "MT");
  });

  it("sends no courseId when a Course Admin edits their own account", async () => {
    asCourseAdmin();
    apiMock.getAdmins.mockResolvedValue([ROSTER[1]]);
    apiMock.updateAdmin.mockResolvedValue({});
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");
    await userEvent.click(within(row).getByRole("button", { name: /Edit/i }));

    const panel = screen.getByRole("heading", { name: /Edit Account/i }).closest(".lab-slide-panel");
    await userEvent.clear(field(panel, 0));
    await userEvent.type(field(panel, 0), "Carmelita");
    await userEvent.click(submit(panel));

    await waitFor(() => expect(apiMock.updateAdmin).toHaveBeenCalled());
    // adminController.update:207 answers courseId from a non-super caller with 403, so
    // the client must not offer it -- not even for their own account.
    expect(apiMock.updateAdmin.mock.calls[0][1]).not.toHaveProperty("courseId");
  });
});

describe("AdminPage — deactivation and deletion call different endpoints", () => {
  it("'Deactivate' calls the toggle-status endpoint, not delete", async () => {
    asSuperAdmin();
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");

    await userEvent.click(within(row).getByRole("button", { name: /Deactivate/i }));

    await waitFor(() => expect(apiMock.toggleAdminStatus).toHaveBeenCalledWith(CT_ADMIN));
    // The distinction matters: DELETE is the endpoint that also revokes the Firebase
    // Auth record. Conflating the two is how a deactivation skips revocation.
    expect(apiMock.deleteAdmin).not.toHaveBeenCalled();
  });

  it("offers 'Activate' for an account already inactive", async () => {
    asSuperAdmin();
    apiMock.getAdmins.mockResolvedValue([{ ...ROSTER[1], status: "inactive" }]);
    apiMock.toggleAdminStatus.mockResolvedValue({ status: "active" });

    await openList();
    const row = await openKebab("cara@slsu.edu.ph");
    expect(within(row).getByRole("button", { name: /Activate/i })).toBeInTheDocument();

    await userEvent.click(within(row).getByRole("button", { name: /Activate/i }));
    await waitFor(() => expect(apiMock.toggleAdminStatus).toHaveBeenCalledWith(CT_ADMIN));
  });

  it("'Delete' calls the delete endpoint and warns that it ends sign-in", async () => {
    asSuperAdmin();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    await openList();
    const row = await openKebab("cara@slsu.edu.ph");
    await userEvent.click(within(row).getByRole("button", { name: /^Delete/i }));

    await waitFor(() => expect(apiMock.deleteAdmin).toHaveBeenCalledWith(CT_ADMIN));
    expect(apiMock.toggleAdminStatus).not.toHaveBeenCalled();
    // The copy must not imply a hard delete, because there is none: the Firestore rows
    // are deliberately kept so incident and borrow-request history stays resolvable.
    expect(confirmSpy.mock.calls[0][0]).toMatch(/no longer be able to log in/i);
  });

  it("never offers Delete on the caller's own row", async () => {
    asSuperAdmin();
    await openList();
    const row = await openKebab("eve@slsu.edu.ph");
    expect(within(row).queryByRole("button", { name: /^Delete/i })).not.toBeInTheDocument();
  });

  // adminController.toggleStatus answers a self-target with 400 "Cannot deactivate your
  // own account", and remove() with the same. Offering both on the caller's own row
  // means a Course Admin -- whose only row is their own -- has nothing but always-
  // failing actions.
  it("never offers Deactivate/Activate on the caller's own row", async () => {
    asSuperAdmin();
    await openList();
    const ownRow = await openKebab("eve@slsu.edu.ph");
    expect(within(ownRow).queryByRole("button", { name: /Deactivate|Activate/i })).not.toBeInTheDocument();
    expect(within(ownRow).getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("leaves a Course Admin no control the server would always refuse", async () => {
    asCourseAdmin();
    apiMock.getAdmins.mockResolvedValue([ROSTER[1]]);
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");

    expect(within(row).queryByRole("button", { name: /^Delete/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Deactivate|Activate/i })).not.toBeInTheDocument();
    // POSITIVE CONTROL: the Edit affordance for their own account is still there.
    expect(within(row).getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });
});

describe("AdminPage — creation is pinned to a Course Admin account", () => {
  it("refuses to submit without a course", async () => {
    asSuperAdmin();
    render(<AdminPage />);
    const panel = await openCreateForm();

    await userEvent.type(field(panel, 0), "New");
    await userEvent.type(field(panel, 1), "Admin");
    await userEvent.type(field(panel, 2), "new@slsu.edu.ph");
    await userEvent.type(field(panel, 3), "Passw0rd!");
    await userEvent.click(submit(panel));

    expect(apiMock.createAdmin).not.toHaveBeenCalled();
    // stringMatching, not a bare /regex/: toHaveBeenCalledWith compares with deep
    // equality, so a RegExp would never equal the string argument.
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/select a course/i));
  });

  it("sends adminLevel 'course' so the server cannot mint a Super Admin by accident", async () => {
    asSuperAdmin();
    apiMock.createAdmin.mockResolvedValue({ id: "u-new" });
    render(<AdminPage />);
    const panel = await openCreateForm();

    await userEvent.type(field(panel, 0), "New");
    await userEvent.type(field(panel, 1), "Admin");
    await userEvent.type(field(panel, 2), "new@slsu.edu.ph");
    await userEvent.type(field(panel, 3), "Passw0rd!");
    await userEvent.selectOptions(courseSelect(panel), "CT");
    await userEvent.click(submit(panel));

    await waitFor(() => expect(apiMock.createAdmin).toHaveBeenCalled());
    expect(apiMock.createAdmin.mock.calls[0][0]).toMatchObject({ adminLevel: "course", courseId: "CT" });
  });
});

describe("AdminPage — status is reported honestly", () => {
  it("shows Inactive, not Active, for a deactivated account", async () => {
    asSuperAdmin();
    apiMock.getAdmins.mockResolvedValue([{ ...ROSTER[1], status: "inactive" }]);
    await openList();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("surfaces a server refusal instead of pretending it worked", async () => {
    asSuperAdmin();
    apiMock.toggleAdminStatus.mockRejectedValue(new Error("Only the Super Admin can manage other admins"));
    await openList();
    const row = await openKebab("cara@slsu.edu.ph");

    await userEvent.click(within(row).getByRole("button", { name: /Deactivate/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Only the Super Admin can manage other admins"));
    // The success toast must NOT have fired.
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

/**
 * Valid DOM nesting.
 *
 * The empty and error slots sit OUTSIDE the roster's table, which is not rendered at
 * all while the list is empty or failed. They used to render `<tr>`, so every mount
 * logged React's validateDOMNesting warning and the browser silently reparented the
 * row. It only became visible here once a test rendered AdminPage before `getAdmins()`
 * resolved -- but it was in the app for real users the whole time.
 */
describe("AdminPage — the empty and error slots produce valid DOM", () => {
  let consoleError;

  beforeEach(() => {
    // React routes validateDOMNesting through console.error. Capture rather than let it
    // print, so a regression is an assertion failure instead of noise in the log.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  const nestingWarnings = () =>
    consoleError.mock.calls.filter((args) => /validateDOMNesting/.test(args.join(" ")));

  it("warns about nothing while the roster is still loading", async () => {
    // The gap that exposed the bug: `admins` is [] until getAdmins() resolves, so the
    // empty state renders on first paint for every user of this page.
    asSuperAdmin();
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("button", { name: LIST_CARD }));

    await waitFor(() => expect(screen.getByText("cara@slsu.edu.ph")).toBeInTheDocument());
    expect(nestingWarnings()).toEqual([]);
  });

  it("renders the empty state as a block, not a table row", async () => {
    asSuperAdmin();
    apiMock.getAdmins.mockResolvedValue([]);
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("button", { name: LIST_CARD }));

    const empty = await screen.findByText("No admin accounts found.");
    expect(empty.tagName).toBe("DIV");
    expect(empty.querySelector("tr")).toBeNull();
    expect(nestingWarnings()).toEqual([]);
  });

  it("renders a load failure as an announced block, not a table row", async () => {
    asSuperAdmin();
    apiMock.getAdmins.mockRejectedValue(new Error("Failed to load admins"));
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("button", { name: LIST_CARD }));

    // LoadError carries role="alert", which the table-row version never did.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Failed to load admins/);
    expect(alert.querySelector("tr")).toBeNull();
    expect(nestingWarnings()).toEqual([]);
  });
});