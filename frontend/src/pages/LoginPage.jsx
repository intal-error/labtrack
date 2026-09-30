import { useState } from "react";
import {
  MdQrCodeScanner, MdInventory2, MdReceiptLong,
  MdArrowBack, MdChevronRight, MdLogin, MdPersonAdd,
} from "react-icons/md";
import SignInForm from "./components/SignInForm";
import SignUpForm from "./components/SignUpForm";
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
  },
];

export default function LoginPage() {
  const [view, setView] = useState("choice");

  const cardClass = [
    "auth-card",
    view === "signup" ? "register-card" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="login-page auth-page">
      <picture>
        <source srcSet="/Lucena.webp" type="image/webp" />
        <img src="/Lucena.png" alt="" className="auth-bg" loading="eager" width="1920" height="1080" decoding="async" />
      </picture>
      <div className="auth-overlay" />

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
                </div>
                <div className="auth-choice-list">
                  {OPTIONS.map(({ key, icon: Icon, title, desc }) => (
                    <button key={key} type="button" className="auth-choice-row" onClick={() => setView(key)}>
                      <span className="auth-choice-icon"><Icon size={18} /></span>
                      <span className="auth-choice-text">
                        <span className="auth-choice-title">{title}</span>
                        <span className="auth-choice-desc">{desc}</span>
                      </span>
                      <MdChevronRight size={18} className="auth-choice-chev" />
                    </button>
                  ))}
                </div>
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
