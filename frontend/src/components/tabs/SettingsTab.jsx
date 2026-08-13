import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

export default function SettingsTab() {
  const { dark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState({
    emailNotifications: true,
    autoBackup: true,
    maintenanceMode: false,
    allowStudentRegistration: true,
    requirePasswordChange: false,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    defaultRole: "Faculty",
  });

  function handleToggle(key) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    toast.success("Setting updated");
  }

  function handleChange(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    toast.success("Settings saved successfully");
  }

  return (
    <div className="tab-content">
      <h2 style={{ color: "var(--dark-green)", fontSize: "1.4rem", marginBottom: 20 }}>Settings</h2>

      <div className="settings-section">
        <h3>Appearance</h3>
        <label>
          Dark Mode
          <div className={`toggle ${dark ? "on" : ""}`} onClick={toggleTheme} />
        </label>
      </div>

      <div className="settings-section">
        <h3>Notifications</h3>
        <label>
          Email Notifications
          <div className={`toggle ${settings.emailNotifications ? "on" : ""}`} onClick={() => handleToggle("emailNotifications")} />
        </label>
        <label>
          Auto Backup
          <div className={`toggle ${settings.autoBackup ? "on" : ""}`} onClick={() => handleToggle("autoBackup")} />
        </label>
      </div>

      <div className="settings-section">
        <h3>Security</h3>
        <label>
          Require Password Change on First Login
          <div className={`toggle ${settings.requirePasswordChange ? "on" : ""}`} onClick={() => handleToggle("requirePasswordChange")} />
        </label>
        <label>
          Maintenance Mode
          <div className={`toggle ${settings.maintenanceMode ? "on" : ""}`} onClick={() => handleToggle("maintenanceMode")} />
        </label>
        <label style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          Session Timeout (minutes)
          <select value={settings.sessionTimeout} onChange={(e) => handleChange("sessionTimeout", e.target.value)} style={{ width: "100%" }}>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
          </select>
        </label>
        <label style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          Max Login Attempts
          <select value={settings.maxLoginAttempts} onChange={(e) => handleChange("maxLoginAttempts", e.target.value)} style={{ width: "100%" }}>
            <option value={3}>3 attempts</option>
            <option value={5}>5 attempts</option>
            <option value={10}>10 attempts</option>
          </select>
        </label>
      </div>

      <div className="settings-section">
        <h3>Role Management</h3>
        <label>
          Allow Student Registration
          <div className={`toggle ${settings.allowStudentRegistration ? "on" : ""}`} onClick={() => handleToggle("allowStudentRegistration")} />
        </label>
        <label style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          Default Role for New Users
          <select value={settings.defaultRole} onChange={(e) => handleChange("defaultRole", e.target.value)} style={{ width: "100%" }}>
            <option value="Faculty">Faculty</option>
            <option value="Staff">Staff</option>
            <option value="Student">Student</option>
          </select>
        </label>
      </div>

      <button className="btn btn-green" onClick={handleSave} style={{ marginTop: 15 }}>Save Settings</button>
    </div>
  );
}
