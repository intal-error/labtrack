import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import {
  MdSchool, MdAdminPanelSettings, MdVisibility, MdVisibilityOff,
  MdMailOutline, MdLockOutline, MdErrorOutline, MdCheckCircle, MdWarningAmber,
  MdQrCodeScanner, MdInventory2, MdReceiptLong,
} from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/login.css";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capsLockOn, setCapsLockOn] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [signedIn, setSignedIn] = useState(false);
  const roleRefs = useRef({});

  useEffect(() => {
    const savedEmail = localStorage.getItem("slsu_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn || authLoading || !role) return;
    if (role !== selectedRole) {
      setError(`This account is registered as ${role}. Please select the correct role.`);
      signOut(auth);
      setSignedIn(false);
      return;
    }
    toast.success("Welcome back!");
    navigate("/home");
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

  return (
    <div className="login-page">
      <img src="/slsulucena.jpg" alt="" className="login-bg" loading="eager" width="1920" height="1080" decoding="async" />
      <div className="login-overlay" />
      <div className="login-shape login-shape-1" />
      <div className="login-shape login-shape-2" />
      <div className="login-shape login-shape-3" />

      <div className="login-content">
        <div className="login-left">
          <div className="login-brand">
            <img src="/logo.png" alt="SLSU Logo" className="login-logo" loading="eager" width="48" height="48" decoding="async" />
            <span className="login-brand-name">SLSU</span>
          </div>
          <h1 className="login-title">LAB<span className="login-title-bold">TRACK</span></h1>
          <p className="login-subtitle">Digital Tracking System for Tool and Equipment Borrowing</p>
          <p className="login-desc">
            A capstone project of Southern Luzon State University - Lucena Campus,
            digitalizing the manual borrowing process for efficiency and accountability.
          </p>
          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li key={i} className="login-feature-item" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <span className="login-feature-icon"><Icon size={18} /></span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-card">
          <h2 className="login-card-title">Welcome Back</h2>
          <p className="login-card-subtitle">Sign in to your account</p>

          <div className="login-role-selector" role="radiogroup" aria-label="Select your role">
            {ROLES.map(({ key, label, icon: Icon, desc }) => (
              <div
                key={key}
                ref={(el) => (roleRefs.current[key] = el)}
                role="radio"
                aria-checked={selectedRole === key}
                tabIndex={selectedRole === key ? 0 : -1}
                className={`login-role-card ${selectedRole === key ? "active" : ""}`}
                onClick={() => { setSelectedRole(key); clearError(); }}
                onKeyDown={(e) => handleRoleKeyDown(e, key)}
              >
                <span className="role-check"><MdCheckCircle size={16} /></span>
                <div className="role-icon"><Icon size={26} /></div>
                <div className="role-label">{label}</div>
                <div className="role-desc">{desc}</div>
              </div>
            ))}
          </div>

          {error && (
            <div className="login-error-banner" role="alert" aria-live="assertive">
              <MdErrorOutline size={18} />
              <span>{error}</span>
              <button type="button" className="login-error-close" onClick={clearError} aria-label="Dismiss error">
                &times;
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><MdMailOutline size={18} /></span>
                <input
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

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><MdLockOutline size={18} /></span>
                <input
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
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                </button>
              </div>
              {capsLockOn && (
                <p className="login-capslock-warning">
                  <MdWarningAmber size={14} /> Caps Lock is on
                </p>
              )}
            </div>

            <div className="login-extras">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>
              <a href="#" className="login-forgot" onClick={handleForgotPassword}>Forgot Password?</a>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {selectedRole !== "admin" && (
            <p className="login-register-link">
              Don&apos;t have an account? <Link to="/register">Register here</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
