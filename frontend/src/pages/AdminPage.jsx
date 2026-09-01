import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { MdAdd, MdList, MdPerson, MdLock, MdPhone, MdWork, MdEmail, MdArrowBack, MdShield, MdEdit, MdDelete, MdVisibility, MdEditNote, MdAssignment, MdSwapHoriz, MdSchool, MdAdminPanelSettings, MdMoreVert, MdClose } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import ViewToggle from "../components/ui/ViewToggle";
import { COURSES } from "../constants/courses";

import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import toast from "react-hot-toast";
import "../styles/pages/admin.css";
import "../styles/pages/shared-form-panel.css";

const PERMISSIONS = [
  { key: "view_catalog", label: "View Catalog", icon: MdVisibility },
  { key: "manage_catalog", label: "Manage Catalog", icon: MdEditNote },
  { key: "view_transactions", label: "View Transactions", icon: MdVisibility },
  { key: "view_requests", label: "View Requests", icon: MdVisibility },
  { key: "process_requests", label: "Process Requests", icon: MdAssignment },
  { key: "admin_management", label: "Admin Management", icon: MdShield },
  { key: "reassign_requests", label: "Reassign Requests", icon: MdSwapHoriz },
];

const EMPTY_FORM = { firstName: "", lastName: "", password: "", contact: "", position: "", email: "", assignCourse: false, assignedCourses: [], assignedYear: "", permissions: ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"] };

export default function AdminPage() {
  const [view, setView] = useState("main");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const { logout, userProfile } = useAuth();
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [openKebab, setOpenKebab] = useState(null);

  const loadAdmins = async () => {
    setError("");
    try { setAdmins(await api.getAdmins()); }
    catch (err) { setError(err.message || "Failed to load admins"); }
  };

  useEffect(() => { if (view === "list") loadAdmins(); }, [view]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".admin-kebab-wrap")) setOpenKebab(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (admin) => {
    setEditing(admin);
    setForm({
      firstName: admin.firstName || admin.firstname || "",
      lastName: admin.lastName || admin.lastname || "",
      password: "",
      contact: admin.contact || "",
      position: admin.position || "",
      email: admin.email || "",
      assignCourse: !!(admin.assignedCourses || admin.assignedCourse),
      assignedCourses: admin.assignedCourses || (admin.assignedCourse ? [admin.assignedCourse] : []),
      assignedYear: admin.assignedYear || "",
      permissions: admin.permissions || ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"],
    });
    setShowForm(true);
    setOpenKebab(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        const payload = { firstName: form.firstName, lastName: form.lastName, position: form.position, contact: form.contact, assignedCourses: form.assignCourse ? form.assignedCourses : [], assignedYear: form.assignCourse ? form.assignedYear : "", permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await api.updateAdmin(editing.id, payload);
        toast.success("Admin updated!");
      } else {
        await api.createAdmin(form);
        toast.success("Admin created!");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      loadAdmins();
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    setOpenKebab(null);
    if (!confirm("Deactivate this admin account? They will no longer be able to log in.")) return;
    try { await api.deleteAdmin(id); toast.success("Admin deactivated!"); loadAdmins(); }
    catch (err) { toast.error(err.message); }
  };

  const handleToggleStatus = async (id) => {
    setOpenKebab(null);
    try {
      const result = await api.toggleAdminStatus(id);
      toast.success(`Admin ${result.status}`);
      loadAdmins();
    } catch (err) { toast.error(err.message); }
  };

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const togglePermission = (perm) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  const getAdminInitials = (a) => `${(a.firstName || a.firstname || "")[0] || ""}${(a.lastName || a.lastname || "")[0] || ""}`.toUpperCase() || "?";

  return (
    <section className="admin-page">
      <PageHero icon={MdAdminPanelSettings} title="Admin" />

      {view === "main" && (
        <div className="admin-main-card fade-in-up">
          <div className="admin-logo-wrap">
            <img src="/logo.png" alt="Logo" className="admin-logo" />
          </div>
          <div className="admin-actions-grid">
            <button className="admin-action-card" onClick={() => { openCreate(); setView("list"); }}>
              <div className="admin-action-icon green"><MdAdd size={28} /></div>
              <span className="admin-action-label">Create Account</span>
              <span className="admin-action-desc">Add new admin or staff</span>
            </button>
            <button className="admin-action-card" onClick={() => setView("list")}>
              <div className="admin-action-icon yellow"><MdList size={28} /></div>
              <span className="admin-action-label">Account List</span>
              <span className="admin-action-desc">View all admin accounts</span>
            </button>
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="admin-list-card fade-in-up">
          <div className="admin-card-header">
            <button className="admin-back-btn" onClick={() => setView("main")}>
              <MdArrowBack size={20} />
            </button>
            <h2>Account List</h2>
            <span className="admin-count-badge">{admins.length}</span>
            <button className="admin-add-btn" onClick={openCreate}><MdAdd size={16} /> Add</button>
            <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-admin-view" />
          </div>

          {error ? (
            <ErrorState message={error} onRetry={loadAdmins} />
          ) : admins.length === 0 ? (
            <EmptyState message="No admin accounts found." />
          ) : (
            <div className="admin-list-scroll">
              {viewMode === "grid" ? (
                <div className="admin-grid">
                  {admins.map((a) => (
                    <div className="admin-account-card" key={a.id}>
                      <div className="admin-account-accent" />
                      <div className="admin-account-body">
                        <div className="admin-account-top">
                          <div className="admin-account-avatar">{getAdminInitials(a)}</div>
                          <div className="admin-account-info">
                            <h4 className="admin-account-name">{a.firstName || a.firstname || ""} {a.lastName || a.lastname || ""}</h4>
                            <p className="admin-account-position">{a.position || "Admin"}</p>
                            <span className={`admin-status-badge ${(a.status || "active") === "active" ? "status-active" : "status-inactive"}`}>
                              {(a.status || "active") === "active" ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="admin-kebab-wrap">
                            <button className="admin-kebab-btn" onClick={() => setOpenKebab(openKebab === a.id ? null : a.id)}>
                              <MdMoreVert size={18} />
                            </button>
                            {openKebab === a.id && (
                              <div className="admin-kebab-dropdown">
                                {userProfile?.id === a.id && <button onClick={() => openEdit(a)}><MdEdit size={14} /> Edit</button>}
                                <button onClick={() => handleToggleStatus(a.id)}><MdShield size={14} /> {(a.status || "active") === "active" ? "Deactivate" : "Activate"}</button>
                                {userProfile?.id !== a.id && <button className="danger" onClick={() => handleDelete(a.id)}><MdDelete size={14} /> Delete</button>}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="admin-account-details">
                          <div className="admin-account-detail">
                            <MdEmail size={14} />
                            <span>{a.email || "-"}</span>
                          </div>
                          {a.contact && (
                            <div className="admin-account-detail">
                              <MdPhone size={14} />
                              <span>{a.contact}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Contact</th>
                        <th>Position</th>
                        <th>Status</th>
                        <th className="admin-th-actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="admin-table-user">
                              <div className="admin-account-avatar admin-avatar-sm">{getAdminInitials(a)}</div>
                               <span className="admin-table-name" title={`${a.firstName || a.firstname || ""} ${a.lastName || a.lastname || ""}`}>{a.firstName || a.firstname || ""} {a.lastName || a.lastname || ""}</span>
                            </div>
                          </td>
                           <td title={a.email || "-"}>{a.email || "-"}</td>
                           <td title={a.contact || "-"}>{a.contact || "-"}</td>
                          <td>{a.position || "Admin"}</td>
                          <td>
                            <span className={`admin-status-badge ${(a.status || "active") === "active" ? "status-active" : "status-inactive"}`}>
                              {(a.status || "active") === "active" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="admin-td-kebab">
                            <div className="admin-kebab-wrap">
                              <button className="admin-kebab-btn" onClick={() => setOpenKebab(openKebab === a.id ? null : a.id)}>
                                <MdMoreVert size={18} />
                              </button>
                              {openKebab === a.id && (
                                <div className="admin-kebab-dropdown">
                                  {userProfile?.id === a.id && <button onClick={() => openEdit(a)}><MdEdit size={14} /> Edit</button>}
                                  <button onClick={() => handleToggleStatus(a.id)}><MdShield size={14} /> {(a.status || "active") === "active" ? "Deactivate" : "Activate"}</button>
                                  {userProfile?.id !== a.id && <button className="danger" onClick={() => handleDelete(a.id)}><MdDelete size={14} /> Delete</button>}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{editing ? "Edit Account" : "Create Account"}</h2>
          <button className="lab-slide-close" onClick={() => { setShowForm(false); setEditing(null); }}>
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleSubmit}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon details"><MdPerson size={14} /></div>
                <span className="lab-form-section-title">Account Info</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>First Name <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required placeholder="First name" />
                    <MdEdit size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Last Name <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required placeholder="Last name" />
                    <MdEdit size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Email <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="Email address" disabled={!!editing} />
                  <MdEmail size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>{editing ? "New Password (blank to keep)" : "Password"}{!editing && <span className="lab-required" />}</label>
                <div className="lab-input-wrap">
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} placeholder={editing ? "Leave blank to keep current" : "Password"} />
                  <MdLock size={16} />
                </div>
                {!editing && (
                  <div className="lab-password-hints">
                    <span className={form.password.length >= 8 ? "hint-met" : ""}>Minimum 8 characters</span>
                    <span className={/[A-Z]/.test(form.password) ? "hint-met" : ""}>At least one uppercase letter</span>
                    <span className={/[a-z]/.test(form.password) ? "hint-met" : ""}>At least one lowercase letter</span>
                    <span className={/[0-9]/.test(form.password) ? "hint-met" : ""}>At least one number</span>
                  </div>
                )}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon schedule"><MdWork size={14} /></div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Contact</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Contact number" />
                    <MdPhone size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Position</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Position" />
                    <MdWork size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon class"><MdSchool size={14} /></div>
                <span className="lab-form-section-title">Course Assignment</span>
              </div>
              <div className="course-assign-section">
                <button type="button" className={`course-toggle-header ${form.assignCourse ? "active" : ""}`} onClick={() => setForm({ ...form, assignCourse: !form.assignCourse, assignedCourses: form.assignCourse ? [] : form.assignedCourses, assignedYear: form.assignCourse ? "" : form.assignedYear })}>
                  <MdSchool size={18} />
                  <span>Assign to Courses for Approvals</span>
                  <span className={`course-toggle-switch ${form.assignCourse ? "on" : ""}`} />
                </button>
                {form.assignCourse && (
                  <div className="course-toggle-fields">
                    <div className="admin-course-chips">
                      {COURSES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`perm-chip ${form.assignedCourses.includes(c) ? "active" : ""}`}
                          onClick={() => {
                            const courses = form.assignedCourses.includes(c)
                              ? form.assignedCourses.filter((x) => x !== c)
                              : [...form.assignedCourses, c];
                            setForm({ ...form, assignedCourses: courses });
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="admin-form-row" style={{ marginTop: 8 }}>
                      <div className="admin-input-wrap">
                        <select value={form.assignedYear} onChange={(e) => setForm({ ...form, assignedYear: e.target.value })}>
                          <option value="">Select Year (optional)</option>
                          {["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"].map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="course-assign-hint">Admin will approve borrow requests for the selected courses.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon location"><MdShield size={14} /></div>
                <span className="lab-form-section-title">Permissions</span>
              </div>
              <div className="perm-grid">
                {PERMISSIONS.map(({ key, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={key}
                    className={`perm-chip ${form.permissions.includes(key) ? "active" : ""}`}
                    onClick={() => togglePermission(key)}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn" disabled={loading}>{loading ? "Saving..." : editing ? "Update Account" : "Create Account"}</button>
            </div>
          </form>
        </div>
      </div>
      {showForm && <div className="lab-slide-backdrop" onClick={() => { setShowForm(false); setEditing(null); }} />}
    </section>
  );
}
