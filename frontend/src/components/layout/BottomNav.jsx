import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
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
    { path: "/home", label: "Home", icon: MdHome, roles: ["student", "admin"] },
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
    { path: "/profile", label: "Profile", icon: MdPerson, roles: ["student", "admin"] },
  ];
  return baseItems.filter((item) => item.roles.includes(role));
};

export default function BottomNav() {
  const { role } = useAuth();
  const location = useLocation();
  const items = getNavItems(role);

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? "active" : ""}`
          }
        >
          <item.icon size={22} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
