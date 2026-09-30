import { useState } from "react";
import {
  MdQrCodeScanner, MdInventory2, MdReceiptLong,
  MdArrowBack, MdChevronRight, MdLogin, MdPersonAdd, MdLockOutline,
  MdLightMode, MdDarkMode,
} from "react-icons/md";
import SignInForm from "./components/SignInForm";
import SignUpForm from "./components/SignUpForm";
import { useTheme } from "../context/ThemeContext";
import "../styles/pages/auth.css";

const FEATURES = [
  { icon: MdQrCodeScanner, text: "QR code scanning for quick borrow & return" },
  { icon: MdInventory2, text: "Real-time inventory tracking" },
  { icon: MdReceiptLong, text: "Automated fines & report generation" },
];

const OPTIONS = [
  {
    key: "signin",
    icon: MdLogin,
    title: "Sign in",
    desc: "Use your existing LabTrack account",
  },
  {
    key: "signup",
    icon: MdPersonAdd,
    title: "Sign up",
    desc: "Create a new student account",
    tag: "New students",
    primary: true,
  },
];

export default function LoginPage() {
  const [view, setView] = useState("choice");
  const { dark, toggleTheme } = useTheme();

  const cardClass = [
    "auth-card",
    view === "signup" ? "register-card" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const themeLabel = dark ? "Light Mode" : "Dark Mode";

  return (
    <div className="login-page auth-page">
      <picture>
        <source srcSet="/Lucena.webp" type="image/webp" />
        <img src="/Lucena.png" alt="" className="auth-bg" loading="eager" width="1920" height="1080" decoding="async" />
      </picture>
      <div className="auth-overlay" />

      <button
        type="button"
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={themeLabel}
        aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      >
        {dark ? <MdLightMode size={17} /> : <MdDarkMode size={17} />}
      </button>

      <div className={`auth-content${view === "signup" ? " is-wide" : ""}`}>
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

        <div className={cardClass}>
          <div className="auth-panel" key={view}>
            {view !== "choice" && (
              <button type="button" className="auth-back" onClick={() => setView("choice")} autoFocus>
                <MdArrowBack size={16} />
                Back
              </button>
            )}

            {view === "choice" && (
              <>
                <div className="auth-card-head">
                  <h2 className="auth-card-title">Get started</h2>
                  <p className="auth-card-subtitle">Choose how you&apos;d like to continue.</p>
                </div>
                <div className="auth-choice-grid">
                  {OPTIONS.map(({ key, icon: Icon, title, desc, tag, primary }) => (
                    <button
                      key={key}
                      type="button"
                      className={`auth-choice-card${primary ? " is-primary" : ""}`}
                      onClick={() => setView(key)}
                    >
                      <span className="auth-choice-icon"><Icon size={19} /></span>
                      <span className="auth-choice-text">
                        <span className="auth-choice-title">
                          {title}
                          {tag && <span className="auth-choice-tag">{tag}</span>}
                        </span>
                        <span className="auth-choice-desc">{desc}</span>
                      </span>
                      <MdChevronRight size={20} className="auth-choice-chev" />
                    </button>
                  ))}
                </div>
                <p className="auth-card-note">
                  <MdLockOutline size={14} />
                  Access is limited to SLSU students and staff.
                </p>
              </>
            )}

            {view === "signin" && (
              <SignInForm onSwitchToSignUp={() => setView("signup")} />
            )}

            {view === "signup" && (
              <SignUpForm onSwitchToSignIn={() => setView("signin")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
