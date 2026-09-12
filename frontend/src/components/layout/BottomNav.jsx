import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyNotifications } from "../../hooks/useQueries";
import { prefetchRoute } from "../../App";
import {
  MdHome,
  MdQrCodeScanner,
  MdInventory,
  MdNotifications,
  MdHistory,
  MdPerson,
} from "react-icons/md";
import "../../styles/pages/bottomnav.css";

const getNavItems = (role) => {
  const baseItems = [
    { path: "/dashboard", label: "Dashboard", icon: MdHome, roles: ["student", "admin"] },
    {
      path: role === "admin" ? "/catalog" : "/scanner",
      label: role === "admin" ? "Catalog" : "Scan",
      icon: role === "admin" ? MdInventory : MdQrCodeScanner,
      roles: ["student", "admin"],
    },
    {
      path: "/transactions",
      label: "Activity",
      icon: MdHistory,
      roles: ["student", "admin"],
    },
    {
      path: "/notifications",
      label: "Alerts",
      icon: MdNotifications,
      roles: ["student", "admin"],
    },
    {
      path: "/settings",
      label: "Profile",
      icon: MdPerson,
      roles: ["student", "admin"],
    },
  ];
  return baseItems.filter((item) => item.roles.includes(role));
};

export default function BottomNav() {
  const { role } = useAuth();
  const items = getNavItems(role);

  const notifResult = useMyNotifications();
  const rawNotifs = notifResult?.data;
  const notifs = Array.isArray(rawNotifs) ? rawNotifs : Array.isArray(rawNotifs?.data) ? rawNotifs.data : [];
  const unreadCount = notifs.filter((n) => !n?.read).length;

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? "active" : ""}`
          }
          onMouseEnter={() => prefetchRoute(item.path)}
        >
          <span className="bottom-nav-icon-wrap">
            <item.icon size={22} />
            {item.path === "/notifications" && unreadCount > 0 && (
              <span className="bottom-nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
