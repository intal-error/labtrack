// Pins the auth navigation state machine: GuestRoute x SignInForm's verdict.
//
// WHY THIS FILE EXISTS: this guard regressed twice, and both times the failure was
// SILENT -- the app "worked", nobody was shown the wrong role, no error was logged,
// and the defect was only visible as a message that never appeared.
//
//   Regression 1: GuestRoute redirected on `user` alone. setUser and the profile
//   fetch land on the same tick, so the redirect fired while `role` was still
//   unresolved and SignInForm was unmounted before it could compare the tapped role
//   against the real one.
//
//   Regression 2 (the subtler one, and the reason this file exists): the fix waited
//   for the role by rendering a SPINNER while `user && role === undefined`. That
//   still unmounts the form -- the role always resolves in that window -- so the
//   verdict was still never computed and every sign-in still fell through to the
//   redirect. The mismatch branch was unreachable code carrying a comment that
//   claimed it prevented a bypass.
//
//   A third defect lived in the same guard: for `user && role === null` (profile
//   lookup FAILED) it rendered the login page. ProfileGate lives in DashboardLayout,
//   which this route never enters, so the one screen offering retry and sign-out
//   could not be displayed for the only case it exists to handle.
//
// The invariant, stated once: the login form must stay MOUNTED for the entire window
// in which a submitted sign-in is waiting for its role, and the route may only take
// over once that role has resolved.
//
// Run: node tests/authFlow.verify.js   (or: npm run verify -w frontend)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

let failures = 0;
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
}

// ── The decision table, re-implemented from App.jsx ─────────────────────────
// Mirrors App.jsx: the flag is the one bit GuestRoute cannot otherwise infer.
const GUEST_ROUTE = { loading: "spinner", signedOut: "form", pending: "form", adjudicating: "form", resolved: "dashboard" };

function guestRoute({ loading, user, role, attemptActive = false }) {
  if (loading) return GUEST_ROUTE.loading;
  if (!user) return GUEST_ROUTE.signedOut;
  if (role === undefined) return GUEST_ROUTE.pending;
  if (attemptActive) return GUEST_ROUTE.adjudicating;
  return GUEST_ROUTE.resolved;
}

console.log("--- GuestRoute keeps the form mounted while a sign-in awaits its role ---");
{
  const cases = [
    { name: "initial, firebase not yet resolved", state: { loading: true, user: null, role: undefined }, want: "spinner" },
    { name: "signed out", state: { loading: false, user: null, role: null }, want: "form" },
    { name: "signed out, role not yet touched", state: { loading: false, user: null, role: undefined }, want: "form" },
    { name: "signed in, role PENDING", state: { loading: false, user: { uid: "u1" }, role: undefined }, want: "form" },
    {
      name: "signed in, role resolved, a submit is being adjudicated",
      state: { loading: false, user: { uid: "u1" }, role: "student", attemptActive: true },
      want: "form",
    },
    {
      name: "signed in, role resolved, nobody adjudicating (returning visitor)",
      state: { loading: false, user: { uid: "u1" }, role: "student" },
      want: "dashboard",
    },
    {
      name: "signed in, profile FAILED (null)",
      state: { loading: false, user: { uid: "u1" }, role: null },
      want: "dashboard",
    },
  ];
  for (const c of cases) {
    const got = guestRoute(c.state);
    check(c.name, got === c.want, `want ${c.want}, got ${got}`);
  }

  check(
    "the pending case is the one that regressed",
    guestRoute({ loading: false, user: { uid: "u1" }, role: undefined }) === "form",
    "rendering anything but `children` here unmounts SignInForm before its verdict can run",
  );
  check(
    "a resolved role is NOT enough on its own to take over",
    guestRoute({ loading: false, user: { uid: "u1" }, role: "student", attemptActive: true }) === "form",
    "redirecting on the resolved role unmounts the form on the exact render its verdict becomes computable",
  );
}

// ── SignInForm's verdict, and the state machine it drives ────────────────────
// Mirrors SignInForm.jsx: `no-profile` deliberately does NOT sign out (the session is
// what the retry needs), and `ok` navigates rather than relying on the route.
function verdict({ signedIn, authLoading, role, selectedRole }) {
  if (!signedIn || authLoading || role === undefined) return "idle";
  if (!role) return "no-profile";
  if (role !== selectedRole) return "wrong-role";
  return "ok";
}

console.log("--- the verdict is actually reachable for a submitted sign-in ---");
{
  // The full sequence a student tapping "Admin" goes through.
  const studentTappedAdmin = { selectedRole: "admin" };
  const seq = [
    { signedIn: false, authLoading: false, role: undefined },
    { signedIn: true, authLoading: true, role: undefined }, // credentials accepted
    { signedIn: true, authLoading: true, role: undefined }, // profile in flight
    { signedIn: true, authLoading: false, role: "student" }, // profile resolved
  ];
  const verdicts = seq.map((s) => verdict({ ...s, ...studentTappedAdmin }));
  check("idle before submitting", verdicts[0] === "idle");
  check("idle while the profile is in flight", verdicts[1] === "idle" && verdicts[2] === "idle");
  check(
    "wrong-role is REACHED (this is what regression 2 killed)",
    verdicts[3] === "wrong-role",
    `got ${verdicts[3]} -- the form was unmounted during the pending window`,
  );
  check(
    "a matching role reaches ok",
    verdict({ signedIn: true, authLoading: false, role: "admin", selectedRole: "admin" }) === "ok",
  );
  check(
    "a failed lookup reaches no-profile",
    verdict({ signedIn: true, authLoading: false, role: null, selectedRole: "admin" }) === "no-profile",
  );
  check(
    "an unsubmitted session-restored visitor never reaches a terminal verdict",
    verdict({ signedIn: false, authLoading: false, role: "student", selectedRole: "admin" }) === "idle",
    "otherwise a returning user would be bounced by a verdict they never asked for",
  );
}

// ── The two guards must agree: who navigates, and when ──────────────────────
// A terminal verdict and the route redirecting on the same render would mean two
// navigations racing (SignInForm's navigate("/dashboard") plus the route's
// Navigate), which is how a user ends up bounced back to /login.
console.log("--- the form and the route do not both navigate ---");
{
  const role = "student";

  // wrong-role: the form signs out, so the route must NOT also navigate. This is the
  // combination that regressed three times.
  const wrongRole = verdict({ signedIn: true, authLoading: false, role, selectedRole: "admin" });
  const duringAdjudication = guestRoute({ loading: false, user: { uid: "u1" }, role, attemptActive: true });
  check("wrong-role is detected", wrongRole === "wrong-role", `got ${wrongRole}`);
  check(
    "  and the route defers to the form",
    duringAdjudication === "form",
    "if the route redirects here, SignInForm unmounts before its effect can sign out",
  );
  check(
    "after the form signs out, the route hands over",
    guestRoute({ loading: false, user: null, role: null }) === "form",
    "user cleared means the login form is correct again",
  );

  // no-profile: the form deliberately does NOT sign out, so the route takes over and
  // ProfileGate (which offers retry) becomes reachable.
  check(
    "no-profile is detected",
    verdict({ signedIn: true, authLoading: false, role: null, selectedRole: "admin" }) === "no-profile",
  );
  check(
    "  and the route takes over to ProfileGate",
    guestRoute({ loading: false, user: { uid: "u1" }, role: null }) === "dashboard",
    "",
  );
}

// ── Source-level guards, so the table above cannot drift from the real guard ──
console.log("--- App.jsx matches the table ---");
{
  const app = read("src/App.jsx");
  const guest = app.slice(app.indexOf("function GuestRoute"), app.indexOf("class ErrorBoundary"));

  check("a pending role keeps the form mounted", guest.includes("if (role === undefined) return children;"));
  check(
    "it still gates on loading before anything else",
    /if \(loading\) return <div className="loading-screen">/.test(guest),
    "",
  );
  check("a signed-out visitor gets the form", /if \(!user\) return children;/.test(guest));

  // The two assertions that carry the real weight. Both were wrong in every previous
  // revision of this guard, and neither was detectable by reading the source: the
  // component test in authFlow.test.jsx is what found them.
  const flagIdx = guest.indexOf("if (signInAttempt) return children;");
  const loadingIdx = guest.indexOf("if (loading) return <div className=");
  check(
    "the attempt flag is checked BEFORE loading",
    flagIdx !== -1 && loadingIdx !== -1 && flagIdx < loadingIdx,
    `flag@${flagIdx} loading@${loadingIdx} -- checking loading first unmounts the form mid-sign-in, because AuthContext sets loading=true for the PROFILE fetch as well as for Firebase startup`,
  );
  check(
    "the flag is read through useSyncExternalStore, not a plain call",
    guest.includes("useSyncExternalStore(subscribeSignInFlow, getSignInAttempt"),
    "SignInForm releases the flag from an effect; a non-reactive read leaves the router un-notified, so it never re-renders and ProfileGate stays unreachable",
  );
  check(
    "every resolved role hands over to the protected layout",
    /return <Navigate to="\/dashboard" replace \/>;/.test(guest),
    "",
  );
  check(
    "no spinner is rendered for a pending role",
    !/role === undefined[\s\S]{0,120}loading-screen/.test(guest),
    "a spinner here unmounts SignInForm and resurrects regression 2",
  );
  check("it imports the reactive accessors", app.includes('from "./utils/signInFlow"'));
}

console.log("--- the flag is armed and always released ---");
{
  const form = read("src/pages/components/SignInForm.jsx");
  // The bound has to clear the explanatory comment between the two statements, which
// is ~250 characters -- a tighter limit silently fails against correct code.
check("armed when credentials are accepted", /setSignedIn\(true\);[\s\S]{0,800}markSignInAttempt\(\)/.test(form));
  check(
    "released on unmount (single place, covers all three exits)",
    /useEffect\(\(\) => \(\) => clearSignInAttempt\(\), \[\]\)/.test(form),
    "a stale flag would park a signed-in user on the login page",
  );
  check(
    "the mismatch message is committed during render, not in the effect",
    /if \(activeVerdict === "wrong-role" && mismatchNotice === null\) \{[\s\S]{0,200}setMismatchNotice\(/.test(form) &&
      /shownError = verdictError \|\| mismatchNotice \|\| error/.test(form),
    "state written inside the effect is reverted by the logout() that follows it, losing the message",
  );
  check(
    "the effect itself sets no state",
    !/activeVerdict === "ok"[\s\S]{0,600}set[A-Z]/.test(form.replace(/setMismatchNotice\([^)]*\);/, "")),
    "",
  );
}

console.log("--- SignInForm keeps the no-profile session alive ---");
{
  const form = read("src/pages/components/SignInForm.jsx");

  // "ok" must be consumable. Excluding it made activeVerdict permanently "idle" for a
  // successful sign-in, which made the happy path unreachable -- and once GuestRoute
  // learned to stand down while an attempt was in flight, that deadlocked correct
  // logins on the login page forever.
  check(
    "\"ok\" is consumable like the other terminal verdicts",
    /if \(verdict !== "idle" && verdict !== consumedVerdict\) \{/.test(form),
    'the guard reads `verdict !== "ok" &&`, which leaves the happy path unreachable',
  );

  // Bounds are deliberately generous. The prose inside this effect explains WHY the
  // flag is not cleared on wrong-role, and a tight bound silently stopped matching --
  // which reads as "the behaviour is gone" when it is only "the comment grew".
  const effect = form.slice(form.indexOf("useEffect(() => {"), form.indexOf("}, [activeVerdict"));

  check(
    "wrong-role signs out",
    /activeVerdict === "wrong-role"[\s\S]{0,900}logout\(\)/.test(effect),
    "",
  );
  check(
    "the wrong-role branch returns BEFORE the flag is released",
    /logout\(\)[\s\S]{0,600}return;[\s\S]{0,300}clearSignInAttempt\(\)/.test(effect),
    "releasing the flag first lets GuestRoute redirect to the dashboard in the gap before logout resolves -- the screen the mismatch exists to deny",
  );
  check(
    "no-profile does NOT sign out",
    (effect.match(/logout\(\)/g) || []).length === 1,
    "signing out would destroy the session ProfileGate needs in order to retry",
  );
  check(
    "ok and no-profile both release the router",
    /clearSignInAttempt\(\);/.test(effect),
    "without releasing the flag, GuestRoute keeps rendering the form and ProfileGate stays unreachable",
  );
  check(
    "navigation is the ROUTER's job -- the form must not also navigate",
    !/navigate\("\/dashboard"\)/.test(form),
    "two navigators race: the form navigates AND GuestRoute redirects once the flag clears",
  );
}

console.log("--- ProfileGate is reachable and owns retry + sign-out ---");
{
  check("ProfileGate exists", fs.existsSync(path.join(here, "..", "src", "components", "ui", "ProfileGate.jsx")));
  const layout = read("src/components/layout/DashboardLayout.jsx");
  check("DashboardLayout renders it", layout.includes("ProfileGate"));
  check(
    "it renders BEFORE the role-gated chrome",
    layout.indexOf("ProfileGate") < layout.indexOf("dash-header"),
    "otherwise the sidebar and header render for a user with no known role",
  );
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);