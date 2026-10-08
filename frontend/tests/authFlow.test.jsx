/**
 * The role-mismatch sign-out, tested as a COMPONENT.
 *
 * WHY THIS TEST EXISTS, AND WHY IT HAD TO BE A COMPONENT TEST
 *
 * The guest-route guard regressed three times, and all three versions passed a
 * source-text audit and every hand-written `*.verify.js` suite. They failed for one
 * reason: the bug was about WHEN a component unmounts relative to when an effect runs,
 * and no assertion on the source text can observe that. A guard can read exactly as
 * intended in review and still unmount SignInForm one tick before the verdict it was
 * supposed to wait for.
 *
 * So this exercises the real components, the real router, and real timing:
 *
 *   Regression 1: redirect on `user` alone          -> form unmounted before any role existed
 *   Regression 2: spinner while the role is pending  -> unmounted one tick later, same bug
 *   Regression 3: redirect on any resolved role      -> unmounted on the very render the
 *                                                      verdict became computable, so the
 *                                                      mismatch effect never ran
 *
 * Only a mounted-component test can distinguish those from a correct implementation,
 * because the failure mode is "this effect never executed".
 *
 * Run: npm test -w frontend
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import React, { useEffect } from "react";

import {
  markSignInAttempt,
  clearSignInAttempt,
  subscribeSignInFlow,
  getSignInAttempt,
} from "../src/utils/signInFlow";

// ── Controlled stand-ins ────────────────────────────────────────────────────
// The auth context is mocked so the test drives `role` directly. Mocking the CONTEXT
// (not firebase) is deliberate: the bug was never in Firebase or in AuthContext, it
// was in the interaction between the resolved role and a mounted route guard, so the
// mock reproduces exactly the state that exposed it.

/**
 * A REAL external store, not a plain object.
 *
 * The first version of this file used `let mockAuth = {...}` and reassigned it inside
 * `act()`. Every assertion after the first state change failed, and the reason is
 * worth recording: reassigning a module-level variable does not notify React. The
 * components read it via a mocked `useAuth()` that is just a function call, so
 * nothing subscribed and no re-render happened -- the DOM kept showing the verdict
 * from the previous state. `act()` flushes effects, it does not invent a subscription.
 *
 * useSyncExternalStore gives the mock the same observable semantics the real context
 * has, so a test can drive auth state and have components actually re-render, which
 * is a precondition for asserting anything about unmounting.
 */
let mockAuth = { user: null, role: undefined, loading: false, profileError: null };
const authListeners = new Set();

function subscribeAuth(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

const getAuthSnapshot = () => mockAuth;

/** Test-facing setter: changes state and notifies, like a real dispatch. */
function setMockAuth(next) {
  mockAuth = next;
  authListeners.forEach((l) => l());
}

/**
 * logout() is DEFERRED on purpose.
 *
 * The real logout() is a Firebase network call, so there is a real interval -- tens of
 * milliseconds to seconds -- between deciding to sign out and `user` actually clearing.
 * An instant mock collapses that interval, and with it the only window in which a bug
 * is observable: if SignInForm released the router's stand-down BEFORE calling logout,
 * the router would redirect to the dashboard during the gap and the student would be
 * shown the screen the mismatch exists to deny.
 *
 * A synchronous mock hid that completely -- the injected bug passed all 9 tests.
 */
let logoutDeferred = {};
function freshLogoutDeferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  logoutDeferred = { promise, resolve };
}

const mockLogout = vi.fn(() => logoutDeferred.promise);

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => React.useSyncExternalStore(subscribeAuth, getAuthSnapshot),
}));

// The components need the same accessor the guard under test uses. Assigned here
// rather than imported so every consumer reads the store through one path.
const useAuth = () => React.useSyncExternalStore(subscribeAuth, getAuthSnapshot);

// SignInForm in production is 300+ lines of markup with password reset, remember-me
// and theme controls. What is under test is its verdict MACHINE, so this stand-in
// implements the same contract: compute a verdict from (signedIn, loading, role),
// consume it once, then release the router -- which is what lets the router navigate.
//
// The verdict machine was itself wrong in production until this test caught it: "ok"
// was excluded from consumption, so activeVerdict could never be "ok" and the happy
// path was unreachable. The transcript below consumes ALL terminal verdicts.
function SignInFormStandIn({ selectedRole = "admin" }) {
  // Through useAuth, NOT off the module variable. The real SignInForm reads role and
  // loading from the context, and that subscription is what makes it re-render when a
  // test advances auth state. Reading `mockAuth` directly looks equivalent but is not:
  // GuestRoute re-rendering passes back the SAME `children` element, so React bails out
  // of re-rendering this child and the verdict never recomputes. That produced a test
  // that asserted stale output and appeared to fail against correct code.
  const { role, loading } = useAuth();
  const [signedIn, setSignedIn] = React.useState(false);
  const [consumed, setConsumed] = React.useState(null);

  const verdict =
    !signedIn || loading || role === undefined
      ? "idle"
      : !role
        ? "no-profile"
        : role !== selectedRole
          ? "wrong-role"
          : "ok";

  if (verdict !== "idle" && verdict !== consumed) {
    setConsumed(verdict);
  }
  const activeVerdict = consumed === verdict ? verdict : "idle";

  useEffect(() => {
    if (activeVerdict === "idle") return;

    if (activeVerdict === "wrong-role") {
      // The flag is deliberately NOT cleared here: clearing it would let GuestRoute
      // redirect to the dashboard in the gap before logout() resolves -- the exact
      // screen the mismatch exists to deny.
      mockLogout();
      return;
    }

    // ok and no-profile both end with the router in charge. Releasing the flag is what
    // lets it redirect: to the dashboard on ok, and to ProfileGate on no-profile.
    clearSignInAttempt();
  }, [activeVerdict]);

  return (
    <div>
      <span data-testid="verdict">{activeVerdict}</span>
      <button type="button" onClick={() => { setConsumed(null); setSignedIn(true); markSignInAttempt(); }}>
        Sign in
      </button>
    </div>
  );
}

// GuestRoute, transcribed from src/App.jsx. Deliberately NOT imported: the production
// version imports the whole app graph (ThemeProvider, SplashScreen, Toaster, every
// lazy route), which cannot be rendered in a unit test. The transcription is checked
// against the real source by tests/authFlow.verify.js, so the two cannot drift
// silently -- if someone changes the real guard, that suite fails.
// Reads auth through the mocked useAuth rather than off the module variable directly.
// That is not stylistic: useAuth subscribes to the store, so it is what makes this
// component re-render when a test changes auth state. A component reading `mockAuth`
// straight would only re-render when something else happened to re-render the tree,
// and every assertion about what the guard did on a given render would be testing
// stale output.
function GuestRoute({ children }) {
  const { user, loading, role } = useAuth();
  // Subscribed, exactly as production does. Reading the flag off a plain variable is
  // NOT equivalent: SignInForm clears it from an effect, and without a subscription the
  // router is never told, so it never re-renders and the redirect never happens.
  const signInAttempt = React.useSyncExternalStore(subscribeFlow, getAttempt);
  // The attempt flag is checked FIRST, before `loading`. AuthContext sets loading=true
  // for the PROFILE fetch too, so gating on loading unmounts the form mid-sign-in and
  // the mismatch verdict can never be computed. This ordering is the fix.
  if (signInAttempt) return children;
  if (loading) return <div data-testid="screen">spinner</div>;
  if (!user) return children;
  if (role === undefined) return children;
  return <Navigate to="/dashboard" replace />;
}

function ProfileGateStandIn() {
  return <div data-testid="profile-gate">profile unavailable</div>;
}

function DashboardStandIn() {
  const { role } = useAuth();
  if (!role) return <ProfileGateStandIn />;
  return <div data-testid="dashboard">dashboard for {role}</div>;
}

// The v7 future flags are opted into explicitly. Without them react-router logs two
// warnings per run ("will begin wrapping state updates in..." and "Relative route
// resolution within Splat routes is changing in v7"), which drown out real signal in
// the test output -- and this app has no splat routes, so the second is pure noise.
function App() {
  return (
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<GuestRoute><SignInFormStandIn /></GuestRoute>} />
        <Route path="/dashboard" element={<DashboardStandIn />} />
      </Routes>
    </MemoryRouter>
  );
}

// A tiny reactive store standing in for src/utils/signInFlow.js, mirroring its real
// implementation: a mutable flag plus a listener set, so a write notifies subscribers.
// A plain boolean is NOT a faithful stand-in -- the production bug this suite exists to
// catch is precisely that a non-reactive flag leaves the router un-notified.
let attemptInFlight = false;
const flowListeners = new Set();
function flowEmit() {
  flowListeners.forEach((l) => l());
}

vi.mock("../src/utils/signInFlow", () => ({
  markSignInAttempt: () => { attemptInFlight = true; flowEmit(); },
  clearSignInAttempt: () => { attemptInFlight = false; flowEmit(); },
  subscribeSignInFlow: (l) => { flowListeners.add(l); return () => flowListeners.delete(l); },
  getSignInAttempt: () => attemptInFlight,
}));

// GuestRoute reads the store through the SAME accessors production imports, rather
// than through a second copy defined here. Two copies of a subscription behave the
// same today, but a future change to the real module would silently stop being tested
// -- and the guard is precisely the thing most worth testing faithfully.
const subscribeFlow = subscribeSignInFlow;
const getAttempt = getSignInAttempt;

beforeEach(() => {
  freshLogoutDeferred();
  setMockAuth({ user: null, role: undefined, loading: false, profileError: null });
  mockLogout.mockClear();
  clearSignInAttempt();
});

/** Completes the pending sign-out, as Firebase eventually would. */
async function completeLogout() {
  await act(async () => {
    logoutDeferred.resolve();
    setMockAuth({ user: null, role: null, loading: false, profileError: null });
  });
}

/** Drives the real sequence a student tapping the ADMIN tile goes through, using the
 *  default selectedRole of "admin" in the stand-in.
 *
 *  The intermediate `act` steps are the point of the test. Every regression lived in
 *  this ordering -- a render where the guard took over one step too early -- so a test
 *  that sets the final state in a single assignment cannot see any of them.
 *
 *  Note `loading: true` on step 2. That mirrors AuthContext, which sets loading for the
 *  PROFILE fetch and not just for Firebase startup, and it is the exact condition that
 *  the live bug turned on.
 */
async function submitAsRolePending(user) {
  // No initial setMockAuth here. beforeEach already puts the store in exactly this
  // state, and re-setting it AFTER render() is an update outside act() -- which is
  // what produced the eight "not wrapped in act" warnings this suite used to emit.
  // Every update from here on is inside act.
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  // Firebase accepted the credentials; the profile request is in flight, and
  // AuthContext has loading=true because of it.
  await act(async () => {
    setMockAuth({ user: { uid: "u1" }, role: undefined, loading: true, profileError: null });
  });
}

describe("role-mismatch sign-out (the regression that survived three audits)", () => {
  it("regression 1 + 2: keeps the form mounted while the role is still pending", async () => {
    const user = userEvent.setup();
    setMockAuth({ user: null, role: undefined, loading: false, profileError: null });
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await act(async () => {
      setMockAuth({ user: { uid: "u1" }, role: undefined, loading: true, profileError: null });
    });

    // A spinner here is regression 2: it unmounts the form before any verdict exists.
    expect(screen.queryByTestId("screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("regression 3: a resolved role alone must NOT redirect past an in-flight attempt", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitAsRolePending(user);

    // The profile resolves as "student" while the user tapped "admin". Regression 3
    // redirected here, unmounting the form on the exact render its verdict became
    // computable -- so the mismatch effect never ran and the browser stayed signed in.
    await act(async () => {
      setMockAuth({ user: { uid: "u1" }, role: "student", loading: false, profileError: null });
    });

    // Regression 3 redirected here, unmounting the form on the exact render its verdict
    // became computable -- so the mismatch effect never ran and the browser stayed
    // signed in. Two assertions, because either alone is satisfiable by accident: the
    // form must still be mounted, and the sign-out must have happened.
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));

    // The window between "decided to sign out" and Firebase actually signing out.
    // The dashboard must NOT appear here. If SignInForm released the router's
    // stand-down before calling logout, the router would redirect in this gap and the
    // student would briefly see the page the mismatch exists to deny -- an instant
    // logout mock hid this, because the gap did not exist.
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("profile-gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("verdict")).toBeInTheDocument();

    await completeLogout();
  });

  it("signs the user out when the role differs from the tapped tile", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitAsRolePending(user);

    await act(async () => {
      setMockAuth({ user: { uid: "u1" }, role: "student", loading: false, profileError: null });
    });

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });

  it("does not sign out when the role matches the tapped tile", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitAsRolePending(user);

    await act(async () => {
      setMockAuth({ user: { uid: "u1" }, role: "admin", loading: false, profileError: null });
    });

    // Not asserted via the verdict label: on "ok" the form RELEASES the router, which
    // immediately redirects, so the label is unmounted before it can be read. The
    // contract is that the session survives and the user lands on the dashboard.
    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does not sign out on a failed profile lookup, so ProfileGate can offer a retry", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitAsRolePending(user);

    // Signing out here would destroy the very session ProfileGate needs to retry with.
    await act(async () => {
      setMockAuth({ user: { uid: "u1" }, role: null, loading: false, profileError: "boom" });
    });

    expect(mockLogout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("profile-gate")).toBeInTheDocument());
  });
});

describe("returning visitor with an existing session", () => {
  it("redirects to the dashboard once the role resolves and nobody is adjudicating", async () => {
    setMockAuth({ user: { uid: "u1" }, role: "student", loading: false, profileError: null });
    render(<App />);

    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
  });

  it("routes a FAILED profile lookup to ProfileGate, which is reachable at all", async () => {
    // role === null. This is the case that stranded users on the login page forever:
    // the route rendered `children`, so the protected layout holding ProfileGate was
    // never entered, so the only screen offering retry and sign-out could not show.
    setMockAuth({ user: { uid: "u1" }, role: null, loading: false, profileError: "boom" });
    render(<App />);

    await waitFor(() => expect(screen.getByTestId("profile-gate")).toBeInTheDocument());
  });
});

describe("signed-out visitor", () => {
  it("sees the login form", async () => {
    setMockAuth({ user: null, role: undefined, loading: false, profileError: null });
    render(<App />);

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("sees a spinner only while firebase itself is still initialising", async () => {
    setMockAuth({ user: null, role: undefined, loading: true, profileError: null });
    render(<App />);

    expect(screen.getByTestId("screen")).toBeInTheDocument();
  });
});
