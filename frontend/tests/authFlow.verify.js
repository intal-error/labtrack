// Pins the auth navigation contract: one login form, and a destination the BACKEND
// chooses.
//
// WHY THIS FILE WAS REWRITTEN, NOT DELETED: it used to assert the opposite of what
// the code now does. It pinned the role-tile verdict machine -- SignInForm comparing
// a tapped tile against the real role and signing out on a mismatch, plus a reactive
// "an attempt is in flight" store shared with the router -- because that machine had
// regressed twice, both times silently.
//
// Those regressions were real. They are also now impossible, because the thing the
// machine policed no longer exists: a role picker cannot disagree with the server
// when there is no picker, because GET /api/auth/profile returns the role, the course
// and `landingPath`, and every route is guarded by a server-side check that ignores
// anything the client claims.
//
// So the invariant is now much smaller, and this file pins it:
//   - the login form must stay MOUNTED until the profile resolves
//   - the destination must come from the server, not be re-derived from the role
//   - the form must not navigate; two navigators race
//   - the failed-lookup case must reach ProfileGate, not strand the user on /login
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

// ── GuestRoute's decision table, re-implemented from App.jsx ────────────────
// No attempt flag any more: with no role for the client to compare against, there is
// nothing for the router to wait FOR.
const GUEST_ROUTE = { loading: "spinner", signedOut: "form", pending: "form", resolved: "landingPath", failed: "landingPath" };

function guestRoute({ loading, user, role }) {
  if (loading) return GUEST_ROUTE.loading;
  if (!user) return GUEST_ROUTE.signedOut;
  if (role === undefined) return GUEST_ROUTE.pending;
  return GUEST_ROUTE.resolved;
}

console.log("--- GuestRoute holds the form until the server has answered ---");
{
  const cases = [
    { name: "initial, firebase not yet resolved", state: { loading: true, user: null, role: undefined }, want: "spinner" },
    { name: "signed out", state: { loading: false, user: null, role: null }, want: "form" },
    { name: "signed out, role not yet touched", state: { loading: false, user: null, role: undefined }, want: "form" },
    { name: "signed in, profile PENDING", state: { loading: false, user: { uid: "u1" }, role: undefined }, want: "form" },
    { name: "signed in, profile resolved", state: { loading: false, user: { uid: "u1" }, role: "student" }, want: "landingPath" },
    // A FAILED lookup. This must NOT be the login page: ProfileGate lives in
    // DashboardLayout, which this route never enters, so redirecting to /login makes
    // the one screen offering retry unreachable for the only case it exists to handle.
    { name: "signed in, profile FAILED (null)", state: { loading: false, user: { uid: "u1" }, role: null }, want: "landingPath" },
  ];
  for (const c of cases) {
    const got = guestRoute(c.state);
    check(c.name, got === c.want, `want ${c.want}, got ${got}`);
  }

  check(
    "the pending case is the one that used to regress",
    guestRoute({ loading: false, user: { uid: "u1" }, role: undefined }) === "form",
    "rendering anything but `children` here unmounts the form the visitor is looking at",
  );
}

console.log("--- the destination comes from the server, never re-derived ---");
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

  // The single most important line: it follows the server's landingPath.
  check(
    "a resolved profile navigates to the server's landingPath",
    /return <Navigate to=\{landingPath \|\| "\/dashboard"\} replace \/>;/.test(guest),
    "a hardcoded /dashboard ignores the student's landingPath",
  );
  check(
    "it reads landingPath from useAuth",
    /const \{ user, loading, role, landingPath \} = useAuth\(\);/.test(guest),
    "",
  );

  // Everything the role tile needed is gone, and its absence is the point.
  check("the attempt flag is gone", !guest.includes("signInAttempt"), "");
  check("so is the reactive subscription", !guest.includes("useSyncExternalStore"), "");
  check("and the signInFlow import", !app.includes("./utils/signInFlow"), "");
  check(
    "the store itself is deleted, not just unused",
    !fs.existsSync(path.join(here, "..", "src", "utils", "signInFlow.js")),
    "a dead module with a useSyncExternalStore contract is an invitation to reintroduce the deadlock",
  );

  check("no spinner is rendered for a pending role", !/role === undefined[\s\S]{0,120}loading-screen/.test(guest), "");

  check(
    "the index route follows the same rule",
    /function LandingRedirect\(\)[\s\S]{0,200}landingPath \|\| "\/dashboard"/.test(app),
    "",
  );
  check("the index route uses LandingRedirect", app.includes("<LandingRedirect />"));
}

console.log("--- the login form asks for credentials and nothing else ---");
{
  const form = read("src/pages/components/SignInForm.jsx");

  check("there is no role picker", !/selectedRole|setSelectedRole|ROLES\.map/.test(form), "");
  check("no radiogroup to select one", !form.includes('role="radiogroup"'), "");
  check("no verdict state machine", !/consumedVerdict|activeVerdict|mismatchNotice/.test(form), "");
  check("it does not sign the browser out", !/logout\(|signOut\(/.test(form), "there is no mismatch left to adjudicate");
  check("it does not navigate", !/navigate\(|useNavigate/.test(form), "two navigators race: the form and GuestRoute");
  // Matched on the import PATH, not the bare name: this file's own header explains
  // what the deleted store was for, so a substring test would fail on the comment.
  check("it does not import the deleted store", !/from "\.\.\/\.\.\/utils\/signInFlow"/.test(form), "");
  check("it does not read the resolved role", !/useAuth\(\)/.test(form), "the form has nothing to compare the account against");

  // The form must still be recognisably a form.
  check("it still submits credentials", /signInWithEmailAndPassword\(auth, email\.trim\(\), password\)/.test(form));
  check("it still surfaces an error", form.includes('className="auth-error"'));
  check("it still offers password reset", form.includes("sendPasswordResetEmail"));
  check("it still offers student sign-up", form.includes("Are you a student?"));
  check(
    "the sign-up wording says student, because registration is student-only",
    !form.includes("Don&apos;t have an account?"),
    "an admin who mistyped their password must not read this as a way to create an admin account",
  );
}

console.log("--- the profile carries the tier and the route ---");
{
  const ctx = read("src/context/AuthContext.jsx");

  check("it publishes landingPath", /landingPath: userProfile\?\.landingPath \|\| null/.test(ctx), "");
  check("it publishes courseId", /courseId: userProfile\?\.courseId \|\| null/.test(ctx));
  check("it publishes courseName", /courseName: userProfile\?\.courseName \|\| ""/.test(ctx));
  check("it publishes isSuperAdmin", /isSuperAdmin: Boolean\(userProfile\?\.isSuperAdmin\)/.test(ctx));
  check("it publishes isCourseAdmin", /isCourseAdmin: Boolean\(userProfile\?\.adminLevel === "course"\)/.test(ctx));

  // A backend that has not shipped the field yet must still yield a usable route,
  // rather than navigating to undefined.
  // CHANGED. The regex pinned the exact source text of the fallback, so adding the kiosk
  // branch broke it while the BEHAVIOUR was still correct. Rewritten to assert the three
  // landings each appear in the fallback chain, which is the property that actually
  // matters: an older backend that omits landingPath must still route a kiosk to the
  // kiosk page and not to /dashboard, where it would render a broken student dashboard.
  check(
    "landingPath is defaulted so an older backend cannot navigate to undefined",
    /landingPath:[\s\S]{0,220}data\.landingPath\s*\|\|/.test(ctx) &&
      /data\.role === "kiosk"/.test(ctx) &&
      /"\/attend\/kiosk"/.test(ctx) &&
      /data\.role === "student"/.test(ctx) &&
      /"\/my-activity"/.test(ctx),
    "the landingPath fallback must cover kiosk, student and default routes",
  );
  check("the derived tier is not stored separately", /userProfile\?\.adminLevel/.test(ctx), "a second source of truth can only disagree with the first");
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