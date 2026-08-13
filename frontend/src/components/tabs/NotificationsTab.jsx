import { useState, useEffect } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdWarning, MdInfo, MdCheckCircle, MdError } from "react-icons/md";

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      setNotifications([
        { id: "1", type: "alert", title: "Missing Records", message: "3 students have no grade records for CS101.", time: "2 hours ago", read: false },
        { id: "2", type: "warning", title: "Incomplete Submissions", message: "Faculty deadline for grade submission is in 3 days.", time: "5 hours ago", read: false },
        { id: "3", type: "info", title: "System Update", message: "New laboratory catalog items have been added.", time: "1 day ago", read: true },
        { id: "4", type: "warning", title: "Pending Evaluations", message: "12 student evaluations are awaiting review.", time: "1 day ago", read: false },
        { id: "5", type: "alert", title: "Overdue Items", message: "5 laboratory items are past their return date.", time: "2 days ago", read: true },
        { id: "6", type: "success", title: "Grade Submission Complete", message: "All grades for BSCS-A have been submitted.", time: "3 days ago", read: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function dismissNotification(id) {
    try {
      await api.dismissNotification(id);
    } catch { /* ignore */ }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.success("Notification dismissed");
  }

  function iconType(type) {
    switch (type) {
      case "alert": return <MdError size={20} />;
      case "warning": return <MdWarning size={20} />;
      case "success": return <MdCheckCircle size={20} />;
      default: return <MdInfo size={20} />;
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2>Notifications {unread > 0 && <span style={{ fontSize: 14, color: "var(--red)" }}>({unread} unread)</span>}</h2>
        <button className="btn btn-outline" onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}>Mark all read</button>
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <p className="empty-state">No notifications</p>
        ) : notifications.map((n) => (
          <div className="notification-item" key={n.id} style={{ opacity: n.read ? 0.7 : 1, borderLeft: n.read ? "none" : "3px solid var(--green)" }}>
            <div className={`notification-icon ${n.type}`}>
              {iconType(n.type)}
            </div>
            <div className="notification-body">
              <h4>{n.title}</h4>
              <p>{n.message}</p>
            </div>
            <span className="notification-time">{n.time}</span>
            <button className="btn-dismiss" onClick={() => dismissNotification(n.id)}>Dismiss</button>
          </div>
        ))}
      </div>
    </div>
  );
}
