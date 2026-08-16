import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdWarning, MdInfo, MdCheckCircle, MdError, MdNotificationsOff, MdFilterList } from "react-icons/md";

const TYPE_CONFIG = {
  alert: { icon: <MdError size={22} />, label: "Alert", color: "#d32f2f", bg: "linear-gradient(135deg,#ffebee,#ffcdd2)" },
  overdue: { icon: <MdError size={22} />, label: "Overdue", color: "#d32f2f", bg: "linear-gradient(135deg,#ffebee,#ffcdd2)" },
  warning: { icon: <MdWarning size={22} />, label: "Warning", color: "#f57c00", bg: "linear-gradient(135deg,#fff3e0,#ffe0b2)" },
  success: { icon: <MdCheckCircle size={22} />, label: "Success", color: "#2e7d32", bg: "linear-gradient(135deg,#e8f5e9,#c8e6c9)" },
  info: { icon: <MdInfo size={22} />, label: "Info", color: "#1565c0", bg: "linear-gradient(135deg,#e3f2fd,#bbdefb)" },
};

export default function NotificationsTab() {
  const { role } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    try {
      let data;
      if (role === "admin") {
        data = await api.getNotifications();
      } else {
        data = await api.getMyNotifications();
      }
      setNotifications(data);
    } catch {
      setNotifications([
        { id: "1", type: "info", title: "System Update", message: "New laboratory catalog items have been added.", read: false, createdAt: new Date().toISOString() },
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

  async function markRead(id) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All marked as read");
    } catch { /* ignore */ }
  }

  function timeAgo(date) {
    if (!date) return "";
    const d = typeof date?.toDate === "function" ? date.toDate() : new Date(date);
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  const unread = notifications.filter((n) => !n.read).length;
  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "read") return n.read;
    return true;
  });

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="notif-header">
        <div className="notif-header-left">
          <h2>Notifications</h2>
          {unread > 0 && <span className="notif-unread-badge">{unread} unread</span>}
        </div>
        {unread > 0 && (
          <button className="btn btn-primary btn-sm" onClick={markAllRead}>
            <MdCheckCircle size={14} /> Mark all read
          </button>
        )}
      </div>

      <div className="notif-filters">
        <button className={`notif-filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          All <span className="notif-filter-count">{notifications.length}</span>
        </button>
        <button className={`notif-filter-btn ${filter === "unread" ? "active" : ""}`} onClick={() => setFilter("unread")}>
          Unread <span className="notif-filter-count">{unread}</span>
        </button>
        <button className={`notif-filter-btn ${filter === "read" ? "active" : ""}`} onClick={() => setFilter("read")}>
          Read <span className="notif-filter-count">{notifications.length - unread}</span>
        </button>
      </div>

      <div className="notification-list">
        {filtered.length === 0 ? (
          <div className="notif-empty">
            <MdNotificationsOff size={48} />
            <h3>No notifications</h3>
            <p>{filter === "all" ? "You're all caught up!" : `No ${filter} notifications`}</p>
          </div>
        ) : filtered.map((n) => {
          const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
          return (
            <div className={`notif-card ${n.read ? "read" : "unread"}`} key={n.id}>
              <div className="notif-card-icon" style={{ background: config.bg, color: config.color }}>
                {config.icon}
              </div>
              <div className="notif-card-body">
                <div className="notif-card-top">
                  <h4>{n.title}</h4>
                  <span className="notif-type-badge" style={{ background: `${config.color}15`, color: config.color }}>
                    {config.label}
                  </span>
                </div>
                <p>{n.message}</p>
                <span className="notif-card-time">{timeAgo(n.createdAt)}</span>
              </div>
              <div className="notif-card-actions">
                {!n.read && (
                  <button className="notif-action-btn read" onClick={() => markRead(n.id)}>
                    <MdCheckCircle size={14} /> Read
                  </button>
                )}
                <button className="notif-action-btn dismiss" onClick={() => dismissNotification(n.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
