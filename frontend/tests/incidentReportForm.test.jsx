/**
 * Mounted-component tests for the student incident report drawer.
 *
 * WHY THIS FILE EXISTS: on a phone the Damage / Lost Item form was unusable. The
 * Cancel and Submit Report row is the last child of the <form> inside
 * .lab-slide-body, which is the drawer's `overflow-y: auto` scroll container, so
 * the row was never pinned. Combined with the drawer being `position: fixed` at
 * `height: 100dvh` with `overflow: hidden` -- which means the `padding-bottom`
 * that clears the ~70px .bottom-nav for page content (bottomnav.css) never
 * reaches it -- the buttons ended up in the band the bottom nav covers, at the
 * very bottom of a four-section form.
 *
 * The fix is CSS (sticky footer inside the scroll container, in
 * shared-form-panel.css). jsdom has no layout engine, so NO TEST HERE CAN PROVE
 * THE STICKY BEHAVIOUR -- that needs a real device. What a mount test CAN do,
 * and what actually regresses, is assert the DOM invariant the whole fix rests
 * on: the action row exists, and it is the last thing in the scroll container.
 * Move the row out of `.lab-slide-body`, drop a button, or rename the container
 * and this file fails. That is the guard worth having.
 *
 * Both report types are exercised because they are the same form -- "Type" is a
 * select, and damage/lost is only a value of it -- and the reported bug was
 * filed as "a Damage or Lost Item report", so pinning it to one value would let
 * the other regress silently.
 *
 * Run: npm test -w frontend
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import IncidentReportForm from "../src/components/incidents/IncidentReportForm";

// ── Mocks ───────────────────────────────────────────────────────────────────

/**
 * vi.hoisted, because vi.mock factories are hoisted above the module body and a
 * plain const would still be in its temporal dead zone when the factory runs.
 */
const apiMock = vi.hoisted(() => ({
  createIncident: vi.fn(async () => ({ id: 1 })),
  uploadImage: vi.fn(async () => ({ url: "https://example.test/p.jpg" })),
}));

vi.mock("../src/services/api", () => ({ api: apiMock }));

/**
 * The real hook would issue a catalog fetch. Two items is enough: one to select,
 * one so the option list is not trivially empty.
 */
vi.mock("../src/hooks/useQueries", () => ({
  useCatalogPreview: () => ({
    data: [
      { id: "c1", itemName: "Arduino Uno", category: "Microcontroller", course: "BSIT" },
      { id: "c2", itemName: "DMM Multimeter", category: "Instrument", course: "BSIT" },
    ],
  }),
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    role: "student",
    user: { displayName: "Test Student" },
    userProfile: { firstName: "Test", lastName: "Student", course: "BSIT" },
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_DESCRIPTION = "The casing is cracked and the LCD no longer powers on.";

function renderForm(overrides = {}) {
  const props = { open: true, onClose: vi.fn(), onSubmitted: vi.fn(), ...overrides };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <IncidentReportForm {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, props };
}

/**
 * Fills the only two fields emptyIncidentForm() leaves blank. `type` and
 * `severity` already carry valid defaults, and `incidentDate` defaults to today,
 * so a form left otherwise untouched validates.
 */
async function completeRequiredFields(user, type) {
  await user.selectOptions(screen.getByLabelText(/item involved/i), "c1");
  await user.selectOptions(screen.getByLabelText(/^type/i), type);
  await user.type(screen.getByLabelText(/description/i), VALID_DESCRIPTION);
}

beforeEach(() => {
  apiMock.createIncident.mockClear();
  apiMock.uploadImage.mockClear();
});

// ── The regression: the action row lives at the end of the scroll container ──

describe.each(["damage", "lost"])("the %s report form", (type) => {
  it("renders Cancel and Submit Report at the end of the scrollable body", async () => {
    const { baseElement } = renderForm();

    /*
     * Queried through `baseElement` (document.body) rather than RTL's
     * `container`. The drawer is rendered with createPortal into document.body
     * so that its z-index escapes the stacking context that .tab-strip-panel's
     * filled opacity animation creates -- see the note in IncidentReportForm.jsx.
     * A portal places the node under <body>, outside RTL's container div, so
     * `container.querySelector` would no longer find it even though the drawer
     * is present and correct.
     */
    const body = baseElement.querySelector(".lab-slide-body");
    expect(body).not.toBeNull();

    const form = body.querySelector("form");
    expect(form).not.toBeNull();

    /*
     * The invariant the sticky-footer fix depends on. shared-form-panel.css pins
     * `.lab-form-actions` with `position: sticky; bottom: 0`, which only holds
     * while the row is the last child of the scrolling content. If a future edit
     * adds a section after it, or lifts it out of `.lab-slide-body` entirely,
     * the buttons stop being reachable on mobile and this is the assertion that
     * says so.
     */
    const actions = form.querySelector(".lab-form-actions");
    expect(actions).not.toBeNull();
    expect(form.lastElementChild).toBe(actions);

    expect(within(actions).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: /submit report/i }),
    ).toBeInTheDocument();
  });

  it("cancels without posting anything", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(apiMock.createIncident).not.toHaveBeenCalled();
  });

  it("submits and closes", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await completeRequiredFields(user, type);
    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(apiMock.createIncident).toHaveBeenCalledTimes(1);
    expect(apiMock.createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: "c1",
        type,
        description: VALID_DESCRIPTION,
      }),
    );
    expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

// ── The guard that keeps a half-filled form from posting ────────────────────

describe("validation", () => {
  it("does not post while the item and description are still blank", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(apiMock.createIncident).not.toHaveBeenCalled();
    expect(screen.getByText(/select the item involved/i)).toBeInTheDocument();
    /*
     * Matched on the full validation string, not "at least 20 characters": the
     * live .incident-char-count hint reads "At least 20 characters (0 so far)"
     * at the same time, so the loose pattern matches two nodes.
     */
    expect(
      screen.getByText(/describe what happened in at least 20 characters/i),
    ).toBeInTheDocument();
  });
});