import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { FiMenu, FiX } from "react-icons/fi";
import { MdDashboard, MdQrCodeScanner, MdInventory, MdPerson, MdAdminPanelSettings, MdInfo, MdLogout } from "react-icons/md";
import { FaHandHolding, FaUndoAlt } from "react-icons/fa";

const navItems = [
  { path: "/", label: "Dashboard", icon: MdDashboard },
  { path: "/scanner", label: "Scan Borrow/Return", icon: MdQrCodeScanner },
  { path: "/borrowed", label: "Borrowed", icon: FaHandHolding },
  { path: "/returned", label: "Returned", icon: FaUndoAlt },
  { path: "/catalog", label: "Catalog", icon: MdInventory },
  { path: "/persona", label: "Persona", icon: MdPerson },
  { path: "/admin", label: "Admin", icon: MdAdminPanelSettings },
  { path: "/about", label: "About", icon: MdInfo },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-layout">
      <button className="burger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <FiX size={22} /> : <FiMenu size={22} />}
      </button>

      <aside className={`sidebar ${sidebarOpen ? "active" : ""}`}>
        <img src="/logo.png" alt="SLSU Logo" className="sidebar-logo" />
        <h2 className="sidebar-title">ADMIN</h2>
        <nav>
          <ul>
            {navItems.map(({ path, label, icon: Icon }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  end={path === "/"}
                  className={({ isActive }) => isActive ? "active" : ""}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={18} /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-logout" onClick={handleLogout}>
            <MdLogout size={18} /> Logout
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <button className="theme-toggle" onClick={toggleTheme}>
          {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
        <Outlet />
      </main>
    </div>
  );
}
