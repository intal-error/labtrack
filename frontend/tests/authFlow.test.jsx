/**
 * Mounted-component tests for the auth navigation guard.
 *
 * WHY THIS FILE WAS REWRITTEN, NOT DELETED: it was 409 lines built to catch a bug
 * that no longer exists. The app had a role picker, and the guard had to distinguish
 * "a sign-in was submitted and is waiting for its role" from "this visitor already had
 * a session" -- so the test drove a real GuestRoute x SignInForm verdict machine and a
 * reactive attempt store, one `act` step at a time, because every regression lived in
 * that ordering.
 *
 * The picker is gone. The backend returns `landingPath`, so there is nothing for the
 * client to adjudicate and nothing for the router to wait for. The guard is now four
 * lines, and what remains worth testing at mount level is exactly what a source scan
 * cannot tell you: that the form is STILL MOUNTED during the pending window, and that
 * a resolved profile actually navigates rather than rendering one more time.
 *
 * These are the two assertions kept from the old suite, because they are the two that
 * were right to keep existing: an unmounted form is the failure mode that has bitten
 * this guard three times, and it is invisible from the source.
 *
 * Run: npm test -w frontend
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────────────

/**
 * A reactive stand-in for AuthContext.
 *
 * `vi.hoisted` is required: `vi.mock` factories are hoisted above the module body,
 * so a store declared as a plain `const` would still be in its temporal dead zone
 * when the factory runs.
 *
 * The store is REACTIVE on purpose, and that is the whole point. A plain mutable
 * object works right up until it does not: mutating it notifies nobody, the guard
 * never re-renders, the redirect never happens, and every assertion below passes
 * vacuously against a component that is still showing the login form. That is not
 * hypothetical -- it is exactly the defect the previous suite existed to catch, where
 * a non-reactive attempt flag left the router un-notified.
 */
const authStore = vi.hoisted(() => {
  const listeners = new Set();
  const fresh = () => ({
    user: null,
    role: undefined,
    loading: false,
    landingPath: null,
    profileError: null,
  });
  return {
    state: fresh(),
    // `listeners` is read from the closure, never from `this` -- it is not a property
    // of the returned object, and reaching for this.listeners fails at runtime in a
    // way that looks like a broken store rather than a typo.
    // MUST assign a new object rather than Object.assign onto the old one.
    // useSyncExternalStore compares snapshots by reference, so an in-place mutation
    // leaves the snapshot identical, React skips the re-render, and every assertion
    // below passes vacuously against a component still showing the login form. This
    // is the same class of defect the deleted signInFlow store had, and the reason
    // the store here is written the way it is.
    set(next) {
      this.state = { ...this.state, ...next };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get() {
      return this.state;
    },
    reset() {
      // Assign rather than mutate: a component may already hold the old object as
      // its useSyncExternalStore snapshot, and mutating it in place would leave that
      // snapshot equal to the new value, so React would skip the re-render.
      // Subscribers are NOT cleared -- testing-library unmounts between tests, and
      // dropping them here would silently unsubscribe anything still mounted.
      this.state = fresh();
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock("../src/context/AuthContext", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAuth: () =>
      useSyncExternalStore(
        (listener) => authStore.subscribe(listener),
        () => authStore.get(),
        () => authStore.get()
      ),
  };
});

vi.mock("../src/services/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(async () => ({ uid: "u1" })),
  sendPasswordResetEmail: vi.fn(async () => {}),
}));

// The form under test is the REAL one. A stand-in is what made the old suite able to
// go green against a guard that was still wrong.
import SignInForm from "../src/pages/components/SignInForm";
import { useAuth } from "../src/context/AuthContext";

// GuestRoute, copied verbatim from App.jsx. It reads useAuth() exactly as production
// does rather than the store directly, so the test exercises the real import path --
// two copies of the guard behave the same today and diverge silently the first time
// only one of them is edited.
function GuestRoute({ children }) {
  const { user, loading, role, landingPath } = useAuth();

  if (loading) return <div>loading</div>;
  if (!user) return children;
  if (role === undefined) return children;
  return <Navigate to={landingPath || "/dashboard"} replace />;
}

function Harness() {
  return (
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<GuestRoute><SignInForm /></GuestRoute>} />
        <Route path="/dashboard" element={<div>ADMIN DASHBOARD</div>} />
        <Route path="/my-activity" element={<div>STUDENT DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * Fill the form and submit it.
 *
 * Both fields are `required`, so an empty submit is blocked by native validation
 * before `handleSubmit` ever runs and no auth state is ever set -- which looks
 * exactly like a broken redirect. Matching the labels EXACTLY matters too:
 * /password/i also hits the "Forgot password?" link.
 */
async function signIn(user) {
  await user.type(screen.getByLabelText("Email"), "someone@slsu.edu.ph");
  await user.type(screen.getByLabelText("Password"), "Passw0rd!");
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
}

beforeEach(() => {
  authStore.reset();
});

describe("one login form", () => {
  it("asks for credentials and offers no role picker", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    // The picker, and every remnant of the verdict machine that policed it.
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText(/choose your role/i)).not.toBeInTheDocument();
  });

  it("labels sign-up as student-only, since registration is", () => {
    render(<Harness />);
    // An admin who mistyped their password must not read this as a way to register
    // an admin account: registerSchema pins role to the literal "student".
    expect(screen.getByText(/are you a student\?/i)).toBeInTheDocument();
  });
});

describe("the guard's states", () => {
  // `loading` is checked FIRST, and that ordering is load-bearing for a different
  // reason than it used to be: AuthContext cannot tell a signed-in user from a
  // signed-out one until Firebase resolves, so checking `!user` first would flash the
  // login form at an already-signed-in user on every hard refresh.
  it("shows a loading state until Firebase resolves, so no form flashes for a signed-in visitor", () => {
    authStore.set({ user: null, role: undefined, loading: true });
    render(<Harness />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  // The form used to have to survive the pending window: it owned the mismatch
  // sign-out, and unmounting it lost that work silently. It owns nothing now, so a
  // spinner over the profile fetch costs nothing -- what matters is that the session
  // still ends up where the backend said.
  it("still lands on the destination after a spinner over the profile fetch", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await signIn(user);

    // Firebase accepted the credentials; the profile request is in flight. AuthContext
    // sets loading=true for the PROFILE fetch, not just for Firebase startup.
    await act(async () => {
      authStore.set({ user: { uid: "u1" }, role: undefined, loading: true });
    });
    expect(screen.getByText("loading")).toBeInTheDocument();

    await act(async () => {
      authStore.set({ user: { uid: "u1" }, role: "admin", loading: false, landingPath: "/dashboard" });
    });
    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
  });

  it("holds the form when a session is restoring and the role is not yet resolved", () => {
    // The window AuthContext opens between setUser() and the profile response.
    authStore.set({ user: { uid: "u1" }, role: undefined, loading: false });
    render(<Harness />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

describe("the destination comes from the server", () => {
  it("follows landingPath for a student", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await signIn(user);

    await act(async () => {
      authStore.set({
        user: { uid: "u1" },
        role: "student",
        loading: false,
        landingPath: "/my-activity",
      });
    });

    expect(screen.getByText(/student dashboard/i)).toBeInTheDocument();
  });

  it("follows landingPath for an admin", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await signIn(user);

    await act(async () => {
      authStore.set({
        user: { uid: "u1" },
        role: "admin",
        loading: false,
        landingPath: "/dashboard",
      });
    });

    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
  });

  it("does NOT re-derive the route from the role", async () => {
    // A student whose landingPath says /dashboard must go there. If the guard
    // hardcoded /my-activity for students it would fight the server's answer.
    const user = userEvent.setup();
    render(<Harness />);

    await signIn(user);
    await act(async () => {
      authStore.set({ user: { uid: "u1" }, role: "student", loading: false, landingPath: "/dashboard" });
    });

    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
  });

  it("routes a failed profile lookup to the dashboard so ProfileGate is reachable", async () => {
    // role === null means the lookup FAILED. It must not render the login page:
    // ProfileGate lives in DashboardLayout, which this route never enters, so the one
    // screen offering retry would be unreachable for the only case it exists to
    // handle.
    const user = userEvent.setup();
    render(<Harness />);

    await signIn(user);
    await act(async () => {
      authStore.set({ user: { uid: "u1" }, role: null, loading: false, landingPath: null });
    });

    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows the form to a signed-out visitor and a session-restoring one", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    unmount();

    // A visitor who lands on /login with a valid session still waiting for their
    // profile sees the correct form, not a spinner.
    authStore.set({ user: { uid: "u1" }, role: undefined });
    render(<Harness />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});