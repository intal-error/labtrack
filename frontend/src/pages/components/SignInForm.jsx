import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../services/firebase";
import {
  MdVisibility, MdVisibilityOff,
  MdMailOutline, MdLockOutline, MdErrorOutline, MdWarningAmber,
} from "react-icons/md";
import toast from "react-hot-toast";

/**
 * One login form for everyone. There is no role picker and no course picker.
 *
 * WHY THEY ARE GONE: the backend already knows both, and knows them authoritatively
 * -- GET /api/auth/profile returns the role, the course and `landingPath`, and every
 * route is guarded by a server-side check that ignores anything the client claims.
 * So a picker could only ever have been cosmetic, and pretending otherwise was worse
 * than cosmetic: the previous version policed the tile by signing the browser out on
 * a mismatch, and that required a reactive "an attempt is in flight" store shared
 * between this form and the router (src/utils/signInFlow.js). It survived four
 * separate attempts to fix a race in which the form was unmounted before it could
 * adjudicate, and the version before that let a student tap "Admin" and be signed
 * straight in as a student.
 *
 * All of that complexity guarded a control that carried no authority. Deleting the
 * control deleted the machinery: ~200 lines here, the store, and its
 * useSyncExternalStore subscription in GuestRoute.
 *
 * The consequence that matters: a successful sign-in no longer has anything to
 * adjudicate. The router redirects on `landingPath` as soon as the profile
 * resolves, which is why this component does not navigate at all -- two navigators
 * racing is how a user ends up bounced back to /login.
 */
export default function SignInForm({ onSwitchToSignUp }) {
  const [email, setEmail] = useState(() => localStorage.getItem("slsu_remembered_email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem("slsu_remembered_email")));
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);

      if (rememberMe) {
        localStorage.setItem("slsu_remembered_email", email.trim());
      } else {
        localStorage.removeItem("slsu_remembered_email");
      }

      // No verdict to compute and no router to stand down for: the session is
      // established, AuthContext will resolve the profile, and GuestRoute will
      // redirect wherever the backend said to.
      toast.success("Welcome back!");
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

  return (
    <>
      <div className="auth-card-head">
        <h2 className="auth-card-title">Welcome back</h2>
        <p className="auth-card-subtitle">Sign in to continue.</p>
      </div>

      {error && (
        <div className="auth-error" role="alert" aria-live="assertive">
          <MdErrorOutline size={18} />
          <span>{error}</span>
          <button type="button" className="auth-error-close" onClick={() => setError("")} aria-label="Dismiss error">
            &times;
          </button>
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
              placeholder="Enter your email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
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
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
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

      {/*
        Labelled for students on purpose. Registration creates a STUDENT account
        only (registerSchema pins role to the literal "student"), so an admin who
        mistyped their password should not read "Create one" as a way to make an
        admin account. This replaced the role tile's only genuinely useful job --
        telling an admin which door they are standing in.
      */}
      <p className="auth-footer">
        Are you a student?{" "}
        <button type="button" className="auth-link" onClick={onSwitchToSignUp}>Create an account</button>
      </p>
    </>
  );
}