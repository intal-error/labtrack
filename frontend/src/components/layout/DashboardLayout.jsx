import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { FiMenu, FiX } from "react-icons/fi";
import { MdDashboard, MdQrCodeScanner, MdInventory, MdPerson, MdAdminPanelSettings, MdInfo, MdLogout, MdDarkMode, MdLightMode } from "react-icons/md";
import { FaHandHolding, FaUndoAlt } from "react-icons/fa";
import "../../styles/pages/layout.css";

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
        <div className="sidebar-logo-wrap">
          <img src="/logo.png" alt="SLSU Logo" className="sidebar-logo" />
          <div className="sidebar-brand">
            <div className="sidebar-brand-title">SLSU LabTrack</div>
            <div className="sidebar-brand-sub">Lab Equipment Tracker</div>
          </div>
        </div>

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
                  <span className="nav-icon"><Icon size={18} /></span>
                  <span className="nav-label">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-bottom-item" onClick={toggleTheme}>
            <span className="nav-icon">{dark ? <MdLightMode size={18} /> : <MdDarkMode size={18} />}</span>
            <span className="nav-label">{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button className="sidebar-bottom-item" onClick={handleLogout}>
            <span className="nav-icon"><MdLogout size={18} /></span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <div className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(false)} />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
