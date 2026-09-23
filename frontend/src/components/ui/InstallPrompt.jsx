import { useState, useEffect } from "react";
import { MdInstallMobile, MdClose } from "react-icons/md";
import "../../styles/pages/install-prompt.css";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const isIOS =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    function beforeInstallHandler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => {
        setShowInstall(true);
      }, 3000);
    }

    function installedHandler() {
      setIsInstalled(true);
      setShowInstall(false);
    }

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", installedHandler);
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
            <p>Tap the Share button, then &quot;Add to Home Screen&quot;</p>
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
