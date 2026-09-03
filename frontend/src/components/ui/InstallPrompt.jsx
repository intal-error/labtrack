import { useState, useEffect } from "react";
import { MdInstallMobile, MdClose } from "react-icons/md";
import "../../styles/pages/install-prompt.css";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show install prompt after 3 seconds
      setTimeout(() => {
        setShowInstall(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for app installed
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowInstall(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstall(false);
    // Don't show again for this session
    sessionStorage.setItem("installDismissed", "true");
  };

  // Don't show if already installed or dismissed
  if (isInstalled || sessionStorage.getItem("installDismissed") === "true") {
    return null;
  }

  // iOS install instructions
  if (isIOS && showInstall) {
    return (
      <div className="install-prompt ios-install">
        <button className="install-close" onClick={handleDismiss}>
          <MdClose size={18} />
        </button>
        <div className="install-content">
          <div className="install-icon">
            <MdInstallMobile size={32} />
          </div>
          <div className="install-text">
            <h3>Install LabTrack</h3>
            <p>Tap the Share button, then "Add to Home Screen"</p>
          </div>
        </div>
      </div>
    );
  }

  // Android/Chrome install button
  if (showInstall && deferredPrompt) {
    return (
      <div className="install-prompt">
        <button className="install-close" onClick={handleDismiss}>
          <MdClose size={18} />
        </button>
        <div className="install-content">
          <div className="install-icon">
            <MdInstallMobile size={32} />
          </div>
          <div className="install-text">
            <h3>Install LabTrack</h3>
            <p>Add to home screen for the best experience</p>
          </div>
          <button className="install-btn" onClick={handleInstall}>
            Install
          </button>
        </div>
      </div>
    );
  }

  return null;
}
