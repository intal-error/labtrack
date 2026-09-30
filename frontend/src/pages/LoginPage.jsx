import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import {
  MdSchool, MdAdminPanelSettings, MdVisibility, MdVisibilityOff,
  MdMailOutline, MdLockOutline, MdErrorOutline, MdWarningAmber,
  MdQrCodeScanner, MdInventory2, MdReceiptLong,
} from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/auth.css";

const ROLES = [
  { key: "student", label: "Student", icon: MdSchool, desc: "Access lab equipment" },
  { key: "admin", label: "Admin", icon: MdAdminPanelSettings, desc: "System administration" },
];

const FEATURES = [
  { icon: MdQrCodeScanner, text: "QR code scanning for quick borrow & return" },
  { icon: MdInventory2, text: "Real-time inventory tracking" },
  { icon: MdReceiptLong, text: "Automated fines & report generation" },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState(() => localStorage.getItem("slsu_remembered_email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem("slsu_remembered_email")));
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [signedIn, setSignedIn] = useState(false);
  const roleRefs = useRef({});

  useEffect(() => {
    if (!signedIn || authLoading || !role) return;
    if (role !== selectedRole) {
      setTimeout(() => {
        setError(`This account is registered as ${role}. Please select the correct role.`);
        setSignedIn(false);
      }, 0);
      signOut(auth);
      return;
    }
    toast.success("Welcome back!");
    navigate("/dashboard");
  }, [signedIn, authLoading, role, selectedRole, navigate]);

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

  const clearError = () => setError("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);

      let userRole = null;
      try {
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        if (userDoc.exists()) {
          userRole = (userDoc.data().role || "").toLowerCase() || null;
        } else {
          const adminDoc = await getDoc(doc(db, "admins", userCredential.user.uid));
          if (adminDoc.exists()) {
            userRole = "admin";
          }
        }
      } catch {
        await signOut(auth);
        setError("Failed to verify your account. Please try again.");
        return;
      }

      if (userRole !== selectedRole) {
        setError(
          userRole
            ? `This account is registered as ${userRole}. Please select the correct role.`
            : "No account found for this role. Please select the correct role."
        );
        await signOut(auth);
        return;
      }

      if (rememberMe) {
        localStorage.setItem("slsu_remembered_email", email.trim());
      } else {
        localStorage.removeItem("slsu_remembered_email");
      }
      setSignedIn(true);
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
    <div className="login-page auth-page">
      <picture>
        <source srcSet="/Lucena.webp" type="image/webp" />
        <img src="/Lucena.png" alt="" className="auth-bg" loading="eager" width="1920" height="1080" decoding="async" />
      </picture>
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-left">
          <div className="auth-brand">
            <img src="/logo.png" alt="SLSU Logo" className="auth-logo" loading="eager" width="48" height="48" decoding="async" />
            <span className="auth-brand-name">SLSU</span>
          </div>
          <h1 className="auth-title">LAB<span className="auth-title-accent">TRACK</span></h1>
          <p className="auth-subtitle">Laboratory Equipment Borrowing, Return &amp; Logbook Attendance System</p>
          <p className="auth-desc">
            A capstone project of Southern Luzon State University - Lucena Campus,
            digitalizing the borrowing, return, and logbook attendance process for efficiency and accountability.
          </p>
          <ul className="auth-features">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li key={i} className="auth-feature-item" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <span className="auth-feature-icon"><Icon size={17} /></span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-card">
          <div className="auth-card-head">
            <h2 className="auth-card-title">Welcome back</h2>
            <p className="auth-card-subtitle">Sign in to your account</p>
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

          {error && (
            <div className="auth-error" role="alert" aria-live="assertive">
              <MdErrorOutline size={18} />
              <span>{error}</span>
              <button type="button" className="auth-error-close" onClick={clearError} aria-label="Dismiss error">
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
              Don&apos;t have an account? <Link to="/register">Register here</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
