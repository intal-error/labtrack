import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdWarning, MdInfo, MdCheckCircle, MdError, MdNotificationsOff, MdOpenInNew, MdNotifications } from "react-icons/md";
import PageHero from "../ui/PageHero";

const TYPE_CONFIG = {
  alert: { icon: <MdError size={22} />, label: "Alert", color: "#d32f2f", bg: "linear-gradient(135deg,#ffebee,#ffcdd2)" },
  overdue: { icon: <MdError size={22} />, label: "Overdue", color: "#d32f2f", bg: "linear-gradient(135deg,#ffebee,#ffcdd2)" },
  warning: { icon: <MdWarning size={22} />, label: "Warning", color: "#f57c00", bg: "linear-gradient(135deg,#fff3e0,#ffe0b2)" },
  success: { icon: <MdCheckCircle size={22} />, label: "Success", color: "#43A047", bg: "linear-gradient(135deg,#e8f5e9,#c8e6c9)" },
  info: { icon: <MdInfo size={22} />, label: "Info", color: "#1565c0", bg: "linear-gradient(135deg,#e3f2fd,#bbdefb)" },
};

function formatFullDate(date) {
  if (!date) return "";
  const d = typeof date?.toDate === "function" ? date.toDate() : new Date(date);
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsTab() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedNotif, setSelectedNotif] = useState(null);

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    try {
      const data = await api.getMyNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function dismissNotification(id) {
    try {
      await api.dismissNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setSelectedNotif((prev) => (prev?.id === id ? null : prev));
      toast.success("Notification dismissed");
    } catch {
      toast.error("Failed to dismiss notification");
    }
  }

  async function markRead(id) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setSelectedNotif((prev) => (prev?.id === id ? { ...prev, read: true } : prev));
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
      <PageHero icon={MdNotifications} title="Notifications" subtitle={unread > 0 ? `${unread} unread notifications` : "Stay updated on your lab activity"}>
        {unread > 0 && (
          <button className="hero-action-btn ghost" onClick={markAllRead}>
            <MdCheckCircle size={16} /> Mark all read
          </button>
        )}
      </PageHero>

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
            <div className={`notif-card ${n.read ? "read" : "unread"}`} key={n.id} onClick={() => setSelectedNotif(n)}>
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
                  <button className="notif-action-btn read" onClick={(e) => { e.stopPropagation(); markRead(n.id); }}>
                    <MdCheckCircle size={14} /> Read
                  </button>
                )}
                <button className="notif-action-btn dismiss" onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}>
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedNotif && (
        <Modal title="Notification Details" onClose={() => setSelectedNotif(null)}>
          <div className="notif-detail">
            <div className="notif-detail-header">
              <div className="notif-detail-icon" style={{ background: (TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).bg, color: (TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).color }}>
                {(TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).icon}
              </div>
              <div>
                <h3>{selectedNotif.title}</h3>
                <span className="notif-type-badge" style={{ background: `${(TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).color}15`, color: (TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).color }}>
                  {(TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).label}
                </span>
              </div>
            </div>
            <div className="notif-detail-message">
              <p>{selectedNotif.message}</p>
            </div>
            <div className="notif-detail-meta">
              <div className="notif-detail-row">
                <span className="notif-detail-label">Date</span>
                <span className="notif-detail-value">{formatFullDate(selectedNotif.createdAt)}</span>
              </div>
              <div className="notif-detail-row">
                <span className="notif-detail-label">Status</span>
                <span className={`notif-detail-value ${selectedNotif.read ? "status-read" : "status-unread"}`}>
                  {selectedNotif.read ? "Read" : "Unread"}
                </span>
              </div>
            </div>
            <div className="notif-detail-actions">
              {!selectedNotif.read && (
                <button className="btn btn-green" onClick={() => markRead(selectedNotif.id)}>
                  <MdCheckCircle size={14} /> Mark as read
                </button>
              )}
              {selectedNotif.link && (
                <button className="btn btn-primary" onClick={() => { navigate(selectedNotif.link); setSelectedNotif(null); }}>
                  <MdOpenInNew size={14} /> View Details
                </button>
              )}
              <button className="btn btn-orange" onClick={() => dismissNotification(selectedNotif.id)}>
                Dismiss
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
