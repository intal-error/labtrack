import { useState, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import toast from "react-hot-toast";
import { MdPerson, MdLock, MdSave, MdVisibility, MdVisibilityOff, MdCameraAlt, MdAccountCircle } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import "../styles/pages/profile.css";

function getPasswordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: "weak", label: "Weak" };
  if (score <= 2) return { level: "fair", label: "Fair" };
  if (score <= 3) return { level: "strong", label: "Strong" };
  return { level: "very-strong", label: "Very Strong" };
}

function formatJoinDate(dateVal) {
  if (!dateVal) return "";
  let d;
  if (typeof dateVal?.toDate === "function") d = dateVal.toDate();
  else if (dateVal?.seconds) d = new Date(dateVal.seconds * 1000);
  else d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProfilePage() {
  const { userProfile, setUserProfile, role } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  const [firstName, setFirstName] = useState(userProfile?.firstName || "");
  const [lastName, setLastName] = useState(userProfile?.lastName || "");
  const [contact, setContact] = useState(userProfile?.contact || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const isDirty = useMemo(() => {
    return (
      firstName.trim() !== (userProfile?.firstName || "") ||
      lastName.trim() !== (userProfile?.lastName || "") ||
      contact.trim() !== (userProfile?.contact || "")
    );
  }, [firstName, lastName, contact, userProfile]);

  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif"].includes(file.type)) {
      toast.error("Only JPG, PNG, and GIF images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        contact: contact.trim(),
        profileURL: url,
      });
      setUserProfile({ ...userProfile, profileURL: url });
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), contact: contact.trim(), profileURL: userProfile?.profileURL || "" });
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Current password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  const initials = `${(firstName || "")[0] || ""}${(lastName || "")[0] || ""}`.toUpperCase() || "?";
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  const roleColor = role === "admin" ? "#d32f2f" : "#1976d2";
  const joinDate = formatJoinDate(userProfile?.createdAt);
  const lastUpdated = formatJoinDate(userProfile?.updatedAt);

  return (
    <div className="profile-page">
      <PageHero icon={MdAccountCircle} title="My Profile" subtitle="Manage your account settings" />

      <div className="profile-card">
        <div className="profile-sidebar">
          <div className="profile-banner" />
          <div className="profile-avatar" style={{ background: userProfile?.profileURL ? "transparent" : roleColor }}>
            {userProfile?.profileURL ? (
              <img src={userProfile.profileURL} alt={`${firstName} ${lastName}`} />
            ) : (
              initials
            )}
            <button
              className="profile-avatar-edit"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Change photo"
            >
              <MdCameraAlt size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              onChange={handlePhotoUpload}
              hidden
            />
          </div>
          <h3 className="profile-name">{firstName} {lastName}</h3>
          <span className="profile-role" style={{ background: roleColor }}>{roleLabel}</span>
          <p className="profile-email">{userProfile?.email || ""}</p>

          <div className="profile-details">
            {joinDate && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Joined</span>
                <span className="profile-detail-value">{joinDate}</span>
              </div>
            )}
            {userProfile?.schoolId && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">School ID</span>
                <span className="profile-detail-value">{userProfile.schoolId}</span>
              </div>
            )}
            {userProfile?.employeeId && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Employee ID</span>
                <span className="profile-detail-value">{userProfile.employeeId}</span>
              </div>
            )}
            {userProfile?.course && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Course</span>
                <span className="profile-detail-value">{userProfile.course}</span>
              </div>
            )}
            {userProfile?.year && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Year</span>
                <span className="profile-detail-value">{userProfile.year}</span>
              </div>
            )}
            {userProfile?.department && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Department</span>
                <span className="profile-detail-value">{userProfile.department}</span>
              </div>
            )}
            {userProfile?.position && (
              <div className="profile-detail-row">
                <span className="profile-detail-label">Position</span>
                <span className="profile-detail-value">{userProfile.position}</span>
              </div>
            )}
          </div>

          <div className="profile-tabs">
            <button
              className={`profile-tab ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <MdPerson size={18} /> Profile
              {activeTab !== "profile" && isDirty && <span className="unsaved-dot" />}
            </button>
            <button
              className={`profile-tab ${activeTab === "password" ? "active" : ""}`}
              onClick={() => setActiveTab("password")}
            >
              <MdLock size={18} /> Password
            </button>
          </div>
        </div>

        <div className="profile-content" key={activeTab}>
          {activeTab === "profile" ? (
            <form onSubmit={handleProfileSave} className="profile-form profile-form-anim">
              <h2>Personal Information</h2>
              <div className="profile-form-grid">
                <div className="profile-field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="profile-field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                  />
                </div>
                <div className="profile-field">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Enter contact number"
                  />
                </div>
                <div className="profile-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={userProfile?.email || ""}
                    disabled
                    className="disabled"
                  />
                  <span className="field-hint">Email cannot be changed</span>
                </div>
                {userProfile?.schoolId && (
                  <div className="profile-field">
                    <label>School ID</label>
                    <input type="text" value={userProfile.schoolId} disabled className="disabled" />
                  </div>
                )}
                {userProfile?.employeeId && (
                  <div className="profile-field">
                    <label>Employee ID</label>
                    <input type="text" value={userProfile.employeeId} disabled className="disabled" />
                  </div>
                )}
                {userProfile?.course && (
                  <div className="profile-field">
                    <label>Course</label>
                    <input type="text" value={userProfile.course} disabled className="disabled" />
                  </div>
                )}
                {userProfile?.department && (
                  <div className="profile-field">
                    <label>Department</label>
                    <input type="text" value={userProfile.department} disabled className="disabled" />
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-green" disabled={saving}>
                <MdSave size={16} /> {saving ? "Saving..." : "Save Changes"}
              </button>
              {lastUpdated && (
                <p className="profile-form-footer">Last updated: {lastUpdated}</p>
              )}
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="profile-form profile-form-anim">
              <h2>Change Password</h2>
              <p className="form-description">Ensure your account uses a strong, unique password.</p>
              <div className="profile-form-grid single-col">
                <div className="profile-field">
                  <label>Current Password</label>
                  <div className="password-wrap">
                    <input
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowCurrent(!showCurrent)} tabIndex={-1}>
                      {showCurrent ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                    </button>
                  </div>
                </div>
                <div className="profile-field">
                  <label>New Password</label>
                  <div className="password-wrap">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} tabIndex={-1}>
                      {showNew ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                    </button>
                  </div>
                  {newPassword && passwordStrength && (
                    <div className="password-strength">
                      <div className="password-strength-bar">
                        <div className={`password-strength-fill ${passwordStrength.level}`} />
                      </div>
                      <span className={`password-strength-text ${passwordStrength.level}`}>{passwordStrength.label}</span>
                    </div>
                  )}
                  {!newPassword && <span className="field-hint">At least 6 characters</span>}
                </div>
                <div className="profile-field">
                  <label>Confirm New Password</label>
                  <input
                    type={showNew ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <span className="field-hint" style={{ color: "var(--red)" }}>Passwords do not match</span>
                  )}
                </div>
              </div>
              <button type="submit" className="btn btn-green" disabled={changingPassword}>
                <MdLock size={16} /> {changingPassword ? "Changing..." : "Change Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
