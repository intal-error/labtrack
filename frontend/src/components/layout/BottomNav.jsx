import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useUnreadCount } from "../../hooks/useQueries";
import { prefetchRoute } from "../../utils/prefetchRoute";
import {
  MdHome,
  MdQrCodeScanner,
  MdHistory,
  MdMenuBook,
  MdNotifications,
  MdAssignment,
  MdAssessment,
} from "react-icons/md";
import { FaExchangeAlt } from "react-icons/fa";
import "../../styles/pages/bottomnav.css";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: MdHome, roles: ["student", "admin"] },
  { path: "/scanner", label: "Scanner", icon: MdQrCodeScanner, roles: ["student"] },
  { path: "/my-activity", label: "My Activity", icon: MdHistory, roles: ["student"] },
  { path: "/transactions", label: "Transactions", icon: FaExchangeAlt, roles: ["admin"] },
  { path: "/borrow-requests", label: "Borrow Requests", icon: MdAssignment, roles: ["admin"] },
  { path: "/resources", label: "Resources", icon: MdMenuBook, roles: ["student", "admin"] },
  { path: "/notifications", label: "Notifications", icon: MdNotifications, roles: ["student"] },
  { path: "/reports", label: "Reports", icon: MdAssessment, roles: ["admin"] },
];

export default function BottomNav() {
  const { role } = useAuth();
  const unreadCount = useUnreadCount();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

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
