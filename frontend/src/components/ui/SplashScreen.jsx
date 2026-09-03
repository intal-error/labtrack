import { useState, useEffect } from "react";
import "../../styles/pages/splash.css";

export default function SplashScreen({ onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        onComplete?.();
      }, 400);
    }, 1800);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? "fade-out" : ""}`}>
      <div className="splash-content">
        <div className="splash-logo-container">
          <img
            src="/slsulucena.jpg"
            alt="SLSU Logo"
            className="splash-logo"
            draggable={false}
          />
          <div className="splash-pulse" />
        </div>
        <h1 className="splash-title">LabTrack</h1>
        <p className="splash-subtitle">Laboratory Equipment Tracking</p>
        <div className="splash-loader">
          <div className="splash-loader-bar" />
        </div>
      </div>
    </div>
  );
}
