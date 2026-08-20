import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import toast from "react-hot-toast";
import {
  MdDarkMode, MdNotifications, MdSecurity, MdPeople,
  MdSave, MdRestartAlt, MdWarning
} from "react-icons/md";
import "../../styles/pages/tabs.css";

const DEFAULTS = {
  emailNotifications: true,
  autoBackup: true,
  maintenanceMode: false,
  allowStudentRegistration: true,
  requirePasswordChange: false,
  sessionTimeout: 30,
  maxLoginAttempts: 5,
  defaultRole: "Faculty",
};

const SETTING_META = {
  emailNotifications: {
    label: "Email Notifications",
    desc: "Send email alerts for borrow requests, returns, and system updates",
  },
  autoBackup: {
    label: "Auto Backup",
    desc: "Automatically back up system data to prevent data loss",
  },
  maintenanceMode: {
    label: "Maintenance Mode",
    desc: "Locks the system so only admins can access it. Students and faculty will be unable to log in.",
    critical: true,
    confirmMessage: "Enabling Maintenance Mode will prevent students and faculty from logging in. Are you sure you want to continue?",
  },
  allowStudentRegistration: {
    label: "Allow Student Registration",
    desc: "Allow new students to register accounts through the public registration page",
  },
  requirePasswordChange: {
    label: "Require Password Change on First Login",
    desc: "Force newly created users to set a new password when they first sign in",
  },
  sessionTimeout: {
    label: "Session Timeout",
    desc: "Automatically log users out after a period of inactivity",
  },
  maxLoginAttempts: {
    label: "Max Login Attempts",
    desc: "Number of failed login attempts before the account is temporarily locked",
  },
  defaultRole: {
    label: "Default Role for New Users",
    desc: "Pre-selected role option on the registration form",
  },
};

export default function SettingsTab() {
  const { dark, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [savedSettings, setSavedSettings] = useState(DEFAULTS);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getSettings();
        const loaded = {
          emailNotifications: data.emailNotifications ?? DEFAULTS.emailNotifications,
          autoBackup: data.autoBackup ?? DEFAULTS.autoBackup,
          maintenanceMode: data.maintenanceMode ?? DEFAULTS.maintenanceMode,
          allowStudentRegistration: data.allowStudentRegistration ?? DEFAULTS.allowStudentRegistration,
          requirePasswordChange: data.requirePasswordChange ?? DEFAULTS.requirePasswordChange,
          sessionTimeout: data.sessionTimeout ?? DEFAULTS.sessionTimeout,
          maxLoginAttempts: data.maxLoginAttempts ?? DEFAULTS.maxLoginAttempts,
          defaultRole: data.defaultRole ?? DEFAULTS.defaultRole,
        };
        setSettings(loaded);
        setSavedSettings(loaded);
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(savedSettings);
  }, [settings, savedSettings]);

  function handleToggle(key) {
    const meta = SETTING_META[key];
    if (meta?.critical && !settings[key]) {
      setConfirmModal({ key, message: meta.confirmMessage });
      return;
    }
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function confirmCriticalAction() {
    if (confirmModal) {
      setSettings((prev) => ({ ...prev, [confirmModal.key]: !prev[confirmModal.key] }));
      setConfirmModal(null);
    }
  }

  function handleChange(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleReset() {
    setSettings({ ...savedSettings });
    toast.success("Changes discarded");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setSavedSettings({ ...settings });
      setLastSaved(new Date());
      toast.success("Settings saved successfully");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="settings-header">
        <div>
          <h2>Settings</h2>
          <p className="settings-subtitle">Manage system preferences and configurations</p>
        </div>
        {lastSaved && (
          <span className="settings-saved-label">
            Last saved: {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-header">
            <MdDarkMode size={20} />
            <h3>Appearance</h3>
          </div>
          <label className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">Dark Mode</span>
              <span className="settings-row-desc">Switch between light and dark themes</span>
            </div>
            <div className={`toggle ${dark ? "on" : ""}`} onClick={toggleTheme} />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <MdNotifications size={20} />
            <h3>Notifications</h3>
          </div>
          {["emailNotifications", "autoBackup"].map((key) => (
            <label key={key} className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">{SETTING_META[key].label}</span>
                <span className="settings-row-desc">{SETTING_META[key].desc}</span>
              </div>
              <div className={`toggle ${settings[key] ? "on" : ""}`} onClick={() => handleToggle(key)} />
            </label>
          ))}
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <MdSecurity size={20} />
            <h3>Security</h3>
          </div>
          {["requirePasswordChange", "maintenanceMode"].map((key) => (
            <label key={key} className={`settings-row ${SETTING_META[key]?.critical && settings[key] ? "critical-active" : ""}`}>
              <div className="settings-row-info">
                <span className="settings-row-label">
                  {SETTING_META[key].label}
                  {SETTING_META[key]?.critical && settings[key] && (
                    <span className="settings-critical-badge">Active</span>
                  )}
                </span>
                <span className="settings-row-desc">{SETTING_META[key].desc}</span>
              </div>
              <div className={`toggle ${settings[key] ? "on" : ""}`} onClick={() => handleToggle(key)} />
            </label>
          ))}
          <label className="settings-row settings-row-select">
            <div className="settings-row-info">
              <span className="settings-row-label">{SETTING_META.sessionTimeout.label}</span>
              <span className="settings-row-desc">{SETTING_META.sessionTimeout.desc}</span>
            </div>
            <select
              value={settings.sessionTimeout}
              onChange={(e) => handleChange("sessionTimeout", Number(e.target.value))}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
          <label className="settings-row settings-row-select">
            <div className="settings-row-info">
              <span className="settings-row-label">{SETTING_META.maxLoginAttempts.label}</span>
              <span className="settings-row-desc">{SETTING_META.maxLoginAttempts.desc}</span>
            </div>
            <select
              value={settings.maxLoginAttempts}
              onChange={(e) => handleChange("maxLoginAttempts", Number(e.target.value))}
            >
              <option value={3}>3 attempts</option>
              <option value={5}>5 attempts</option>
              <option value={10}>10 attempts</option>
            </select>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <MdPeople size={20} />
            <h3>Role Management</h3>
          </div>
          <label className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">{SETTING_META.allowStudentRegistration.label}</span>
              <span className="settings-row-desc">{SETTING_META.allowStudentRegistration.desc}</span>
            </div>
            <div className={`toggle ${settings.allowStudentRegistration ? "on" : ""}`} onClick={() => handleToggle("allowStudentRegistration")} />
          </label>
          <label className="settings-row settings-row-select">
            <div className="settings-row-info">
              <span className="settings-row-label">{SETTING_META.defaultRole.label}</span>
              <span className="settings-row-desc">{SETTING_META.defaultRole.desc}</span>
            </div>
            <select
              value={settings.defaultRole}
              onChange={(e) => handleChange("defaultRole", e.target.value)}
            >
              <option value="Faculty">Faculty</option>
              <option value="Staff">Staff</option>
              <option value="student">Student</option>
            </select>
          </label>
        </div>
      </div>

      {isDirty && (
        <div className="settings-sticky-bar">
          <span className="settings-unsaved-label">Unsaved changes</span>
          <div className="settings-sticky-actions">
            <button className="btn btn-outline" onClick={handleReset}>
              <MdRestartAlt size={16} /> Discard
            </button>
            <button className="btn btn-green" onClick={handleSave} disabled={saving}>
              <MdSave size={16} /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {!isDirty && (
        <button className="btn btn-green" onClick={handleSave} disabled={saving} style={{ marginTop: 15 }}>
          <MdSave size={16} /> {saving ? "Saving..." : "Save Settings"}
        </button>
      )}

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="settings-confirm-header">
              <MdWarning size={32} color="#f57c00" />
              <h3>Enable Maintenance Mode?</h3>
            </div>
            <p className="settings-confirm-message">{confirmModal.message}</p>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button className="btn btn-green" onClick={confirmCriticalAction}>
                Yes, Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
