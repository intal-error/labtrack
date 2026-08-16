import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdHistory, MdCheckCircle, MdAccessTime } from "react-icons/md";

function toDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function UsageLogsTab() {
  const { user } = useAuth();
  const [borrowed, setBorrowed] = useState([]);
  const [returned, setReturned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("borrowed");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [b, r] = await Promise.all([api.getBorrowed(), api.getReturned()]);
      const userId = user?.uid;
      setBorrowed(b.filter((t) => t.userId === userId));
      setReturned(r.filter((t) => t.userId === userId));
    } catch {
      toast.error("Failed to load activity");
    } finally {
      setLoading(false);
    }
  }

  const active = tab === "borrowed" ? borrowed : returned;

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdHistory size={22} /> My Activity</h2>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === "borrowed" ? "active" : ""}`} onClick={() => setTab("borrowed")}>
          <MdAccessTime size={16} /> Borrowed ({borrowed.length})
        </button>
        <button className={`tab-btn ${tab === "returned" ? "active" : ""}`} onClick={() => setTab("returned")}>
          <MdCheckCircle size={16} /> Returned ({returned.length})
        </button>
      </div>

      <div className="usage-log-list">
        {active.length === 0 ? (
          <p className="empty-state">{tab === "borrowed" ? "No active borrows" : "No return history"}</p>
        ) : active.map((item) => {
          const date = toDate(item.timestamp || item.borrowedAt);
          const dueDate = toDate(item.dueDate);
          const returnDate = toDate(item.returnedAt);
          return (
            <div className="usage-log-card" key={item.id}>
              <div className="usage-log-icon">
                {tab === "returned" ? <MdCheckCircle size={20} style={{ color: "#2e7d32" }} /> : <MdAccessTime size={20} style={{ color: "#f57c00" }} />}
              </div>
              <div className="usage-log-body">
                <h4>{item.itemName}</h4>
                <div className="usage-log-meta">
                  <span>Qty: {item.quantity}</span>
                  {date && <span>Borrowed: {date.toLocaleDateString()}</span>}
                  {dueDate && <span>Due: {dueDate.toLocaleDateString()}</span>}
                  {returnDate && <span>Returned: {returnDate.toLocaleDateString()}</span>}
                </div>
              </div>
              <span className={`badge ${tab === "returned" ? "badge-success" : "badge-warning"}`}>
                {tab === "returned" ? "Returned" : item.status || "Borrowed"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
