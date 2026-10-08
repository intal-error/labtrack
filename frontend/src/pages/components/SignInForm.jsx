import { useState, useEffect, useRef } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { markSignInAttempt, clearSignInAttempt } from "../../utils/signInFlow";
import {
  MdSchool, MdAdminPanelSettings, MdVisibility, MdVisibilityOff,
  MdMailOutline, MdLockOutline, MdErrorOutline, MdWarningAmber,
} from "react-icons/md";
import toast from "react-hot-toast";

const ROLES = [
  { key: "student", label: "Student", icon: MdSchool, desc: "Access lab equipment" },
  { key: "admin", label: "Admin", icon: MdAdminPanelSettings, desc: "System administration" },
];

export default function SignInForm({ onSwitchToSignUp }) {
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState(() => localStorage.getItem("slsu_remembered_email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem("slsu_remembered_email")));
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  // `role` is `undefined` until the FIRST onAuthStateChanged callback has run at all,
// then `null` if the profile lookup failed or found nothing. The verdict below treats
// undefined and null differently on purpose: undefined means "we do not know yet",
// null means "we know, and there is no role".
const { role, loading: authLoading, profileError, logout } = useAuth();
const [signedIn, setSignedIn] = useState(false);
  const roleRefs = useRef({});

  /*
   * Where the sign-in attempt stands, and the gate that owns it.
   *
   * WHY GuestRoute CANNOT REDIRECT ANY MORE: it used to read `user` and redirect on
   * it. But AuthContext calls setUser(firebaseUser) and only THEN awaits
   * api.getProfile() for the role (App.jsx redirect vs AuthContext.jsx setUser are
   * both on the same tick). So `user` became truthy while `role` was still null,
   * GuestRoute fired <Navigate to="/dashboard">, and this whole component was
   * unmounted before a verdict was ever computed.
   *
   * The result: `verdict` never left "idle", signOut() never ran, and a student who
   * tapped the ADMIN role tile was signed straight in as a student. The
   * "This account is registered as student" message was unreachable dead code, and
   * the role picker was cosmetic.
   *
   * So GuestRoute now waits for the role (see App.jsx) and this component owns both
   * the redirect and the mismatch sign-out.
   *
   * `idle` covers signed-out and still-resolving alike; `ok` means the account is
   * confirmed and belongs to the selected role.
   */
  const verdict = !signedIn || authLoading || role === undefined
    ? "idle"
    : !role
      ? "no-profile"
      : role !== selectedRole
        ? "wrong-role"
        : "ok";

/*
 * The attempt is consumed the first time it reaches a terminal verdict.
 *
 * Without this, signOut() would drive Firebase back to signed-out, role would go
 * null, verdict would recompute to "no-profile" again, and the effect would sign
 * out and report a mismatch forever. Consuming it during render -- rather than
 * with setState inside the effect -- is React's supported "adjust state when a
 * prop changes" pattern, and it keeps the effect free of setState entirely.
 *
 * "ok" MUST be consumable like the others. It used to be excluded here, which made
 * activeVerdict permanently "idle" for a successful sign-in (consumedVerdict was
 * never set to "ok", so `consumedVerdict === verdict` never held) and therefore
 * made the effect's "ok" branch -- the toast and the navigate -- unreachable code.
 * Harmless while GuestRoute redirected on a resolved role; NOT harmless once GuestRoute
 * was taught to stand down while an attempt is in flight, because the flag was then
 * only ever cleared on unmount and nothing ever unmounted the form. A correct login
 * left the user parked on the login page forever. Excluding "ok" was the bug; this
 * comment is here so it is not reintroduced as an optimisation.
 */
  const [consumedVerdict, setConsumedVerdict] = useState(null);
  if (verdict !== "idle" && verdict !== consumedVerdict) {
    setConsumedVerdict(verdict);
  }
  const activeVerdict = consumedVerdict === verdict ? verdict : "idle";

  // Set during render, for the same reason as consumedVerdict above -- and for one
  // more: the mismatch notice has to OUTLIVE the sign-out that mismatch triggers.
  // Any state written inside the effect below is reverted by the logout() on its
  // next line (`role` becomes null, the verdict recomputes to no-profile), so a
  // message set there would be replaced by a generic one before the user could read
  // it. Storing it here makes it component state that logout() cannot touch.
  const [mismatchNotice, setMismatchNotice] = useState(null);
  if (activeVerdict === "wrong-role" && mismatchNotice === null) {
    setMismatchNotice(`This account is registered as ${role}. Please select the correct role.`);
  }

  // Derived, not stored: the message depends on state that can change under us
  // (profileError arrives with the role resolution, selectedRole can be toggled),
  // and a stored copy would go stale.
  const verdictError =
    activeVerdict === "no-profile"
      ? profileError
        ? `Could not verify your account: ${profileError}`
        : "No account found for this role. Please select the correct role."
      : activeVerdict === "wrong-role"
        ? `This account is registered as ${role}. Please select the correct role.`
        : "";

  // Only external side effects -- no setState here. Depending on `activeVerdict`
  // (a single terminal string) rather than on role and profileError separately means
  // this fires once per outcome, not once per field that changed.
  //
  // NAVIGATION IS THE ROUTER'S JOB, NOT THIS FORM'S.
  //
  // GuestRoute stands down for as long as an attempt is in flight, because only this
  // component knows which role tile was tapped. The moment a verdict is final it has
  // to hand that responsibility back, and the way to do that is clearSignInAttempt()
  // -- the next render of GuestRoute sees a resolved role and redirects.
  //
  // So the happy path does NOT call navigate() itself. Two navigators racing is how a
  // user ends up bounced back to /login, and calling both made the earlier version of
  // this effect fight the router.
  //
  // The flag is deliberately NOT cleared on `wrong-role`. Clearing it there would let
  // GuestRoute redirect to the dashboard in the gap before logout() resolves, which is
  // precisely the screen the mismatch exists to deny. The unmount cleanup below releases
  // it instead, and the next submit re-arms it.
  useEffect(() => {
    if (activeVerdict === "idle") return;

    if (activeVerdict === "wrong-role") {
      // The account exists and is confirmed, but it is registered under the OTHER role
      // tile. The credentials were valid, so this browser must not stay signed in --
      // otherwise the student would simply land on the dashboard they were denied.
      //
      // The message itself was already committed during render (see mismatchNotice), so
      // this branch stays a pure side effect, which is what keeps the effect contract
      // above honest.
      logout().catch(() => {
        // Firebase sign-out failed. Nothing more to do here; GuestRoute will still
        // redirect once `user` clears.
      });
      return;
    }

    // `ok` and `no-profile` both end with the router in charge:
    //   ok          -> the role resolved and matches, so it redirects to /dashboard
    //   no-profile  -> it redirects to ProfileGate, which owns the retry
    // Clearing the flag is what lets it do either.
    clearSignInAttempt();

    if (activeVerdict === "ok") toast.success("Welcome back!");
  }, [activeVerdict, logout, role]);

  // Release the router's stand-down on unmount. All three exits unmount this
  // component (ok navigates away, no-profile is taken over by the route), so this is
  // the single place that can guarantee the flag cannot outlive the attempt. A stale
  // "true" would park a signed-in user on the login page for the rest of the session.
  useEffect(() => () => clearSignInAttempt(), []);

  function handleRoleKeyDown(e, key) {
    const keys = ROLES.map((r) => r.key);
    const idx = keys.indexOf(key);
    let nextIdx = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % keys.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + keys.length) % keys.length;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setSelectedRole(key);
      return;
    }
    if (nextIdx !== null) {
      e.preventDefault();
      setSelectedRole(keys[nextIdx]);
      roleRefs.current[keys[nextIdx]]?.focus();
    }
  }

  const clearError = () => {
    setError("");
    // The mismatch notice has to clear with everything else, or retrying after a
    // wrong tile would still be showing the previous account's complaint.
    setMismatchNotice(null);
  };

  // A locally-owned message (wrong password, rate limited, ...) OR the derived
  // verdict message. The verdict takes precedence while it applies, because it
  // describes the more recent failure -- an invalid-credential message left over
  // from the submit attempt would otherwise mask "wrong role for this account".
  const shownError = verdictError || mismatchNotice || error;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // The role is NOT read here. It used to be a pair of getDoc() calls against
      // `firebase/firestore`, duplicating what AuthContext already does for the
      // same user on the same page -- the import alone was costing the app 215 kB
      // of Firestore SDK in its entry chunk. AuthContext resolves the profile via
      // the API, and the effect above completes the sign-in once `role` arrives.
      if (rememberMe) {
        localStorage.setItem("slsu_remembered_email", email.trim());
      } else {
        localStorage.removeItem("slsu_remembered_email");
      }
      // Start a fresh attempt: clears the previous attempt's verdict, so retrying
      // with the correct role tile re-evaluates instead of showing a stale message.
      setConsumedVerdict(null);
      setSignedIn(true);
      // Tell the router to stay out of the way until this component has adjudicated
      // the result. Without it GuestRoute redirects the moment `role` resolves --
      // which unmounts this form on the exact render its verdict became computable,
      // so the mismatch branch below would never run.
      markSignInAttempt();
    } catch (err) {
      let msg = "Login failed. Please try again.";
      if (err.code === "auth/invalid-credential") msg = "Invalid email or password. Please check your credentials.";
      else if (err.code === "auth/user-not-found") msg = "No account found with this email.";
      else if (err.code === "auth/wrong-password") msg = "Incorrect password. Please try again.";
      else if (err.code === "auth/too-many-requests") msg = "Too many attempts. Please try again later.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address above, then click Forgot Password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success("Password reset email sent! Check your inbox.");
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError("Failed to send reset email. Please try again.");
      }
    }
  };

  const handleCapsLock = (e) => {
    if (e.getModifierState) setCapsLockOn(e.getModifierState("CapsLock"));
  };

  const activeRole = ROLES.find((r) => r.key === selectedRole) || ROLES[0];

  return (
    <>
      <div className="auth-card-head">
        <h2 className="auth-card-title">Welcome back</h2>
        <p className="auth-card-subtitle">Choose your role, then sign in.</p>
      </div>

      <div className="auth-role-block">
        <div className="auth-segmented" role="radiogroup" aria-label="Select your role">
          {ROLES.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              ref={(el) => (roleRefs.current[key] = el)}
              role="radio"
              aria-checked={selectedRole === key}
              tabIndex={selectedRole === key ? 0 : -1}
              className={`auth-segment ${selectedRole === key ? "active" : ""}`}
              onClick={() => { setSelectedRole(key); clearError(); }}
              onKeyDown={(e) => handleRoleKeyDown(e, key)}
            >
              <Icon size={16} className="auth-segment-icon" />
              <span className="auth-segment-label">{label}</span>
            </div>
          ))}
        </div>
        <p className="auth-role-hint">{activeRole.desc}</p>
      </div>

      {shownError && (
        <div className="auth-error" role="alert" aria-live="assertive">
          <MdErrorOutline size={18} />
          <span>{shownError}</span>
          {/* The verdict message is derived and clears itself once the role
              resolves or the user retypes, so dismissing it is a no-op for that
              branch -- which is honest, and avoids storing a second copy of state
              that has to be invalidated in step with `role`. */}
          {verdictError ? null : (
            <button type="button" className="auth-error-close" onClick={clearError} aria-label="Dismiss error">
              &times;
            </button>
          )}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">Email</label>
          <div className="auth-input-wrap has-left">
            <span className="auth-input-icon"><MdMailOutline size={17} /></span>
            <input
              className="auth-input"
              id="email"
              type="email"
              placeholder={`Enter your ${selectedRole} email`}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">Password</label>
          <div className="auth-input-wrap has-left has-toggle">
            <span className="auth-input-icon"><MdLockOutline size={17} /></span>
            <input
              className="auth-input"
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              onKeyDown={handleCapsLock}
              onKeyUp={handleCapsLock}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <MdVisibilityOff size={19} /> : <MdVisibility size={19} />}
            </button>
          </div>
          {capsLockOn && (
            <p className="auth-capslock">
              <MdWarningAmber size={14} /> Caps Lock is on
            </p>
          )}
        </div>

        <div className="auth-extras">
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <a href="#" className="auth-forgot" onClick={handleForgotPassword}>Forgot password?</a>
        </div>

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      {selectedRole !== "admin" && (
        <p className="auth-footer">
          Don&apos;t have an account?{" "}
          <button type="button" className="auth-link" onClick={onSwitchToSignUp}>Create one</button>
        </p>
      )}
    </>
  );
}
