import { useState } from "react";
import { auth } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import SignInForm from "./components/SignInForm";
import { useKioskSession } from "../hooks/useKioskSession";
import "../styles/pages/auth.css";

/**
 * Sign-in gate for the attendance kiosk.
 *
 * WHY THIS IS A SEPARATE COMPONENT rather than a check inside AttendanceKioskPage:
 * that page starts its camera from a useEffect keyed on the scan step. A gate placed
 * inside its render path would still mount the page, so the effect would run and the
 * camera would open while nobody is signed in. Returning BEFORE the page mounts is the
 * only thing that actually prevents it. The page itself is left untouched by auth.
 *
 * `role !== "kiosk"` is the important check, not merely "signed in". Without it any
 * signed-in account -- a student, a course admin -- could sign in here and record
 * attendance, which is exactly the authority the kiosk role exists to isolate.
 *
 * The idle timeout runs on this component, so it keeps counting while the page is
 * mounted. `blocked` is handed down: during the 60-second countdown the page must not
 * start a new scan, otherwise a scan begun at 4:59 keeps the device busy indefinitely
 * and the sign-out can never complete.
 */
export default function KioskAuthGate({ children }) {
  const { user, role, loading } = useAuth();
  const { countdown, blocked, setBusy } = useKioskSession(auth);
  const [denied, setDenied] = useState(false);

  // Loading is tri-state in AuthContext: role is undefined while the profile lookup is
  // in flight and null when it completed with no role. Only `loading` tells us to wait;
  // treating undefined as "no role" would bounce a kiosk out during sign-in.
  if (loading || role === undefined) {
    return (
      <div className="auth-page" style={{ display: "grid", placeItems: "center" }}>
        <div className="auth-card" style={{ textAlign: "center" }}>
          <p>Checking kiosk session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card-head">
            <h1>Attendance Kiosk</h1>
            <p className="auth-subtitle">Sign in with the kiosk account to begin.</p>
          </div>
          {denied && (
            <p className="auth-error" role="alert">
              This account is not authorised for the kiosk. Use the kiosk account.
            </p>
          )}
          <SignInForm onSwitchToSignUp={() => {}} />
        </div>
      </div>
    );
  }

  // Signed in, but not as a kiosk. Show the reason rather than bouncing, so an operator
  // who signed in with the wrong account understands why nothing happens.
  if (role !== "kiosk") {
    return (
      <div className="auth-page" style={{ display: "grid", placeItems: "center" }}>
        <div className="auth-card" style={{ textAlign: "center" }} role="alert">
          <h1>Not a kiosk account</h1>
          <p>
            Signed in as <strong>{user.email}</strong> ({role || "no role"}).
          </p>
          <p>This station only accepts the dedicated kiosk account.</p>
          <button
            type="button"
            className="auth-submit"
            onClick={() => setDenied(false)}
            style={{ marginTop: "1rem" }}
          >
            Try another account
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {countdown > 0 && (
        <div
          role="alertdialog"
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.88)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          <div>
            <h1 style={{ fontSize: "3rem", margin: 0 }}>{countdown}</h1>
            <p style={{ fontSize: "1.25rem" }}>
              Signing out in {countdown} second{countdown === 1 ? "" : "s"} — the kiosk has been idle for 5 minutes.
            </p>
            <p style={{ opacity: 0.75 }}>
              New scans are blocked. An attendance record already being submitted will
              finish first.
            </p>
          </div>
        </div>
      )}
      {/*
       * Render prop, not an element: the page needs `blocked` (to refuse a new scan
       * during the countdown) and `setBusy` (so the timeout waits for an in-flight
       * scan). Passing an element would hide both. The page already reads ?room= from
       * the URL itself, so nothing else needs threading.
       */}
      {typeof children === "function" ? children({ blocked, setBusy }) : children}
    </>
  );
}