import { useSearchParams } from "react-router-dom";
import { MdInbox, MdCheckCircle, MdAssignment, MdEventAvailable } from "react-icons/md";
import PesoIcon from "../components/ui/PesoIcon";
import TransactionsPanel from "./activity/TransactionsPanel";
import RequestsPanel from "./activity/RequestsPanel";
import AttendancePanel from "./activity/AttendancePanel";
import FinesTab from "../components/tabs/FinesTab";
import "../styles/pages/my-activity.css";
import "../styles/pages/tab-strip.css";

const TABS = [
  { key: "borrowed", label: "Borrowed", icon: MdInbox },
  { key: "returned", label: "Returned", icon: MdCheckCircle },
  { key: "requests", label: "Requests", icon: MdAssignment },
  { key: "attendance", label: "Attendance", icon: MdEventAvailable },
  { key: "fines", label: "Fines", icon: PesoIcon },
];

const TAB_KEYS = TABS.map((t) => t.key);

export default function MyActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab = TAB_KEYS.includes(requested) ? requested : "borrowed";

  const switchTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === "borrowed") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="my-activity-page">
      <div className="tab-strip" role="tablist" aria-label="My activity">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-strip-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => switchTab(key)}
            type="button"
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tab-strip-panel" role="tabpanel">
        {activeTab === "borrowed" && <TransactionsPanel mode="borrowed" />}
        {activeTab === "returned" && <TransactionsPanel mode="returned" />}
        {activeTab === "requests" && <RequestsPanel />}
        {activeTab === "attendance" && <AttendancePanel />}
        {activeTab === "fines" && <FinesTab />}
      </div>
    </div>
  );
}
