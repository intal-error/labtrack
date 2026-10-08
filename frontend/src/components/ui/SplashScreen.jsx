import { useState, useEffect, useRef } from "react";
import "../../styles/pages/splash.css";

export default function SplashScreen({ onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  // Both timers are tracked now. The inner 400 ms one used to be untracked, so if
  // anything unmounted the splash inside that window it fired onComplete against
  // an already-unmounted component. Nothing does today, which is exactly why it
  // survived this long.
  const innerTimerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      innerTimerRef.current = setTimeout(() => {
        onComplete?.();
      }, 400);
    }, 1800);

    return () => {
      clearTimeout(timer);
      clearTimeout(innerTimerRef.current);
    };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? "fade-out" : ""}`}>
      <div className="splash-content">
        <div className="splash-logo-container">
          {/* icon-192x192 instead of the old /logo.png (1.2 MB source, 266 kB
              served) for a 100x100 slot, and it now declares its intrinsic size.
              Without width/height the browser had no aspect ratio to reserve, so
              the logo shifted the whole splash down once it decoded. */}
          <img
            src="/icons/icon-192x192.png"
            alt="SLSU Logo"
            className="splash-logo"
            width="100"
            height="100"
            decoding="async"
            draggable={false}
          />
          <div className="splash-pulse" />
        </div>
        <h1 className="splash-title">LabTrack</h1>
        <p className="splash-subtitle">Borrowing, Return & Logbook Attendance</p>
        <div className="splash-loader">
          <div className="splash-loader-bar" />
        </div>
      </div>
    </div>
  );
}
