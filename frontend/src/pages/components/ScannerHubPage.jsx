import { useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import "../../styles/pages/scanner.css";
import "../../styles/pages/attendance-scanner.css";
import { MdQrCodeScanner, MdEventAvailable } from "react-icons/md";

const EquipmentScanner = lazy(() => import("./EquipmentScanner"));
const AttendanceScanner = lazy(() => import("./AttendanceScanner"));

const TABS = [
  { key: "equipment", label: "Equipment", icon: MdQrCodeScanner },
  { key: "attendance", label: "Attendance", icon: MdEventAvailable },
];

export default function ScannerHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "attendance" ? "attendance" : "equipment";
  const [activeTab, setActiveTab] = useState(initialTab);

  const switchTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === "attendance" ? { tab: "attendance" } : {}, { replace: true });
  };

  return (
    <section className="scanner-page">
      <div className="scanner-hub-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`scanner-hub-tab ${activeTab === key ? "active" : ""}`}
            onClick={() => switchTab(key)}
            type="button"
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      <div className="scanner-shell">
        <Suspense fallback={<div className="scanner-loading"><div className="spinner-lg" /></div>}>
          {activeTab === "equipment" ? <EquipmentScanner /> : <AttendanceScanner />}
        </Suspense>
      </div>
    </section>
  );
}
