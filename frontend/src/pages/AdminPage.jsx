import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { MdAdd, MdList, MdLogout, MdPerson, MdLock, MdPhone, MdWork, MdEmail, MdArrowBack, MdShield, MdEdit, MdDelete, MdGridView, MdViewList, MdVisibility, MdEditNote, MdAssignment, MdSwapHoriz, MdSchool } from "react-icons/md";
import { COURSES } from "../constants/courses";

import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import toast from "react-hot-toast";
import "../styles/pages/admin.css";

const PERMISSIONS = [
  { key: "view_catalog", label: "View Catalog", icon: MdVisibility },
  { key: "manage_catalog", label: "Manage Catalog", icon: MdEditNote },
  { key: "view_transactions", label: "View Transactions", icon: MdVisibility },
  { key: "view_requests", label: "View Requests", icon: MdVisibility },
  { key: "process_requests", label: "Process Requests", icon: MdAssignment },
  { key: "admin_management", label: "Admin Management", icon: MdShield },
  { key: "reassign_requests", label: "Reassign Requests", icon: MdSwapHoriz },
];

export default function AdminPage() {
  const [view, setView] = useState("main");
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "", contact: "", position: "", email: "", assignCourse: false, assignedCourse: "", assignedYear: "", permissions: ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayMode, setDisplayMode] = useState("grid");
  const { logout } = useAuth();
  const navigate = useNavigate();

  const loadAdmins = async () => {
    setError("");
    try { setAdmins(await api.getAdmins()); }
    catch (err) { setError(err.message || "Failed to load admins"); }
  };

  useEffect(() => { if (view === "list") loadAdmins(); }, [view]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createAdmin(form);
      toast.success("Admin created!");
      setForm({ firstName: "", lastName: "", password: "", contact: "", position: "", email: "", assignCourse: false, assignedCourse: "", assignedYear: "", permissions: ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"] });
      setView("list");
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Deactivate this admin account?")) return;
    try { await api.deleteAdmin(id); toast.success("Admin deactivated!"); loadAdmins(); }
    catch (err) { toast.error(err.message); }
  };

  const handleToggleStatus = async (id) => {
    try {
      const result = await api.toggleAdminStatus(id);
      toast.success(`Admin ${result.status}`);
      loadAdmins();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async (id) => {
    const admin = admins.find((a) => a.id === id);
    if (!admin) return;
    const firstname = prompt("First name:", admin.firstName || admin.firstname || "");
    if (firstname === null) return;
    const lastname = prompt("Last name:", admin.lastName || admin.lastname || "");
    if (lastname === null) return;
    const position = prompt("Position:", admin.position || "");
    const contact = prompt("Contact:", admin.contact || "");
    const course = prompt("Assigned Course:", admin.assignedCourse || "");
    const year = prompt("Assigned Year:", admin.assignedYear || "");
    const password = prompt("New password (blank to keep):", "");
    try {
      await api.updateAdmin(id, { firstName: firstname, lastName: lastname, position, contact, assignedCourse: course || undefined, assignedYear: year || undefined, password: password || undefined });
      toast.success("Updated!"); loadAdmins();
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
      <div className="admin-header">
        <div className="admin-header-icon">
          <MdShield size={28} />
        </div>
        <div>
          <h1>Admin</h1>
          <p className="admin-subtitle">System administration panel</p>
        </div>
      </div>

      {view === "main" && (
        <div className="admin-main-card fade-in-up">
          <div className="admin-logo-wrap">
            <img src="/logo.png" alt="Logo" className="admin-logo" />
          </div>
          <div className="admin-actions-grid">
            <button className="admin-action-card" onClick={() => setView("create")}>
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

      {view === "create" && (
        <div className="admin-create-card fade-in-up">
          <div className="admin-card-header">
            <button className="admin-back-btn" onClick={() => setView("main")}>
              <MdArrowBack size={20} />
            </button>
            <h2>Create Account</h2>
          </div>
          <form onSubmit={handleCreate} className="admin-form">
            <div className="admin-form-row">
              <div className="admin-input-wrap">
                <MdPerson className="admin-input-icon" size={20} />
                <input type="text" placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="admin-input-wrap">
                <MdPerson className="admin-input-icon" size={20} />
                <input type="text" placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="admin-input-wrap">
              <MdEmail className="admin-input-icon" size={20} />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="admin-input-wrap">
              <MdLock className="admin-input-icon" size={20} />
              <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="admin-form-row">
              <div className="admin-input-wrap">
                <MdPhone className="admin-input-icon" size={20} />
                <input type="text" placeholder="Contact Number" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="admin-input-wrap">
                <MdWork className="admin-input-icon" size={20} />
                <input type="text" placeholder="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
            </div>
            <div className="course-assign-section">
              <button type="button" className={`course-toggle-header ${form.assignCourse ? "active" : ""}`} onClick={() => setForm({ ...form, assignCourse: !form.assignCourse, assignedCourse: form.assignCourse ? "" : form.assignedCourse, assignedYear: form.assignCourse ? "" : form.assignedYear })}>
                <MdSchool size={18} />
                <span>Assign to Course for Approvals</span>
                <span className={`course-toggle-switch ${form.assignCourse ? "on" : ""}`} />
              </button>
              {form.assignCourse && (
                <div className="course-toggle-fields">
                  <div className="admin-form-row">
                    <div className="admin-input-wrap">
                      <select value={form.assignedCourse} onChange={(e) => setForm({ ...form, assignedCourse: e.target.value })}>
                        <option value="">Select Course</option>
                        {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="admin-input-wrap">
                      <select value={form.assignedYear} onChange={(e) => setForm({ ...form, assignedYear: e.target.value })}>
                        <option value="">Select Year</option>
                        {["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"].map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="course-assign-hint">Admin will approve borrow requests from students of this course.</p>
                </div>
              )}
            </div>
            <div className="perm-section">
              <label className="perm-section-label">Permissions</label>
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
            <div className="admin-form-actions">
              <button type="submit" className="admin-submit-btn" disabled={loading}>
                {loading ? "Creating..." : "Create Account"}
              </button>
              <button type="button" className="admin-cancel-btn" onClick={() => setView("main")}>Cancel</button>
            </div>
          </form>
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
            <div className="admin-display-toggle">
              <button
                className={`admin-toggle-btn ${displayMode === "grid" ? "active" : ""}`}
                onClick={() => setDisplayMode("grid")}
                title="Grid View"
              >
                <MdGridView size={18} />
              </button>
              <button
                className={`admin-toggle-btn ${displayMode === "list" ? "active" : ""}`}
                onClick={() => setDisplayMode("list")}
                title="List View"
              >
                <MdViewList size={18} />
              </button>
            </div>
          </div>

          {error ? (
            <ErrorState message={error} onRetry={loadAdmins} />
          ) : admins.length === 0 ? (
            <EmptyState message="No admin accounts found." />
          ) : (
            <div className="admin-list-scroll">
              {displayMode === "grid" ? (
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
                          {(a.assignedCourse || a.assignedYear) && (
                            <div className="admin-account-detail">
                              <MdWork size={14} />
                              <span>{a.assignedCourse || "No Course"} - {a.assignedYear || "No Year"}</span>
                            </div>
                          )}
                        </div>
                        <div className="admin-account-actions">
                          <button className="admin-btn-edit" onClick={() => handleUpdate(a.id)}>
                            <MdEdit size={14} /> Edit
                          </button>
                          <button className="admin-btn-edit" onClick={() => handleToggleStatus(a.id)} style={{ color: (a.status || "active") === "active" ? "#f57c00" : "#43A047" }}>
                            {(a.status || "active") === "active" ? "Deactivate" : "Activate"}
                          </button>
                          <button className="admin-btn-delete" onClick={() => handleDelete(a.id)}>
                            <MdDelete size={14} /> Delete
                          </button>
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
                        <th>Admin</th>
                        <th>Email</th>
                        <th>Contact</th>
                        <th>Course - Year</th>
                        <th>Position</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="admin-table-user">
                              <div className="admin-account-avatar admin-avatar-sm">{getAdminInitials(a)}</div>
                              <span className="admin-table-name">{a.firstName || a.firstname || ""} {a.lastName || a.lastname || ""}</span>
                            </div>
                          </td>
                          <td>{a.email || "-"}</td>
                          <td>{a.contact || "-"}</td>
                          <td>{(a.assignedCourse || a.assignedYear) ? `${a.assignedCourse || "No Course"} - ${a.assignedYear || "No Year"}` : "-"}</td>
                          <td>{a.position || "Admin"}</td>
                          <td>
                            <span className={`admin-status-badge ${(a.status || "active") === "active" ? "status-active" : "status-inactive"}`}>
                              {(a.status || "active") === "active" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div className="admin-table-actions">
                              <button className="admin-btn-edit" onClick={() => handleUpdate(a.id)}>
                                <MdEdit size={14} />
                              </button>
                              <button className="admin-btn-edit" onClick={() => handleToggleStatus(a.id)} style={{ color: (a.status || "active") === "active" ? "#f57c00" : "#43A047", fontSize: 12 }}>
                                {(a.status || "active") === "active" ? "Deactivate" : "Activate"}
                              </button>
                              <button className="admin-btn-delete" onClick={() => handleDelete(a.id)}>
                                <MdDelete size={14} />
                              </button>
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
    </section>
  );
}
