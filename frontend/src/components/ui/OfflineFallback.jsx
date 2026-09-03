import { MdWifiOff, MdRefresh } from "react-icons/md";
import "../../styles/pages/offline.css";

export default function OfflineFallback() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="offline-screen">
      <div className="offline-content">
        <div className="offline-icon">
          <MdWifiOff size={48} />
        </div>
        <h1 className="offline-title">No Internet Connection</h1>
        <p className="offline-subtitle">
          Please check your network settings and try again.
        </p>
        <button className="offline-btn" onClick={handleRefresh}>
          <MdRefresh size={18} />
          Try Again
        </button>
        <div className="offline-tips">
          <p>You can still access previously loaded content.</p>
        </div>
      </div>
    </div>
  );
}
