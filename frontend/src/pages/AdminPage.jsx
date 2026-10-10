import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCourseOptions } from "../hooks/useQueries";
import { MdAdd, MdList, MdPerson, MdLock, MdPhone, MdWork, MdEmail, MdArrowBack, MdShield, MdEdit, MdDelete, MdSchool, MdMoreVert, MdClose } from "react-icons/md";
import ViewToggle from "../components/ui/ViewToggle";

import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import toast from "react-hot-toast";
import "../styles/pages/admin.css";
import "../styles/pages/shared-form-panel.css";

/*
 * courseId replaces assignedCourse / assignedCourses / assignedYear.
 *
 * assignedCourses was an ARRAY, and an array is what allowed one admin to span two
 * courses -- the exact shape courseScope.js exists to prevent. assignedYear was
 * consulted by the attendance scoping that was removed, so it is dead. `permissions`
 * is retained only so existing rows keep round-tripping: no code reads it, so it
 * is stored metadata rather than an access control, and the adminController guards
 * are what actually decide who may do what.
 */
const EMPTY_FORM = { firstName: "", lastName: "", password: "", contact: "", position: "", email: "", courseId: "", permissions: ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"] };

export default function AdminPage() {
  const [view, setView] = useState("main");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const { userProfile, isSuperAdmin } = useAuth();
  const { options: courseOptions } = useCourseOptions();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [openKebab, setOpenKebab] = useState(null);

  const loadAdmins = async () => {
    setError("");
    try { setAdmins(await api.getAdmins()); }
    catch (err) { setError(err.message || "Failed to load admins"); }
  };

  useEffect(() => {
    if (view !== "list") return;
    (async () => {
      try {
        const data = await api.getAdmins();
        setError("");
        setAdmins(data);
      } catch (err) {
        setError(err.message || "Failed to load admins");
      }
    })();
  }, [view]);

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
      // courseId first, falling back to the legacy shapes so an account created
      // before this feature still shows the course it has rather than a blank select.
      courseId:
        admin.courseId ||
        admin.assignedCourse ||
        (Array.isArray(admin.assignedCourses) ? admin.assignedCourses[0] || "" : ""),
      permissions: admin.permissions || ["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"],
    });
    setShowForm(true);
    setOpenKebab(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing && !form.courseId) {
      return toast.error("Select a course for this Course Admin");
    }
    setLoading(true);
    try {
      if (editing) {
        // courseId is deliberately NOT sent. The backend refuses to move an account
        // between courses through this endpoint, because reassigning one is how a
        // Course Admin would end up responsible for a course nobody appointed them
        // to. Reassignment is a Super Admin action on the roster, done explicitly.
        const payload = {
          firstName: form.firstName,
          lastName: form.lastName,
          position: form.position,
          contact: form.contact,
          permissions: form.permissions,
        };
        if (form.password) payload.password = form.password;
        await api.updateAdmin(editing.id, payload);
        toast.success("Admin updated!");
      } else {
        await api.createAdmin({ ...form, adminLevel: "course" });
        toast.success("Course Admin created!");
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


  const getAdminInitials = (a) => `${(a.firstName || a.firstname || "")[0] || ""}${(a.lastName || a.lastname || "")[0] || ""}`.toUpperCase() || "?";

  return (
    <section className="admin-page">

      {view === "main" && (
        <div className="admin-main-card fade-in-up">
          <div className="admin-logo-wrap">
            <img src="/icons/icon-192x192.png" alt="Logo" className="admin-logo" width="48" height="48" decoding="async" />
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
            <h2>{isSuperAdmin ? "Account List" : "Your Account"}</h2>
            <span className="admin-count-badge">{admins.length}</span>
            {isSuperAdmin && (
              <button className="admin-add-btn" onClick={openCreate}><MdAdd size={16} /> Add</button>
            )}
            <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-admin-view" />
          </div>

          {/*
            A Course Admin is not shown a one-row "roster" and left to work out what it
            means. GET /api/admin returns ONLY their own record for them, so the count
            badge would read 1 on a page titled "Account List" -- which reads as a bug
            rather than as a boundary. Saying so explicitly is the difference between a
            permission and a defect.
          */}
          {!isSuperAdmin && (
            <div className="admin-scope-notice">
              <MdSchool size={16} />
              <div>
                <strong>Course Admin</strong>
                <p>
                  You can view and edit your own account. Creating, reassigning and
                  deactivating Course Admin accounts is the Super Admin&apos;s job.
                </p>
              </div>
            </div>
          )}

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
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                    <MdEdit size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Last Name <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                    <MdEdit size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Email <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editing} />
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
                    <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
                    <MdPhone size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Position</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
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
                {/*
                  ONE course per admin, as a select rather than the old multi-select chips.

                  The chips allowed an admin to hold several courses at once, and that shape is
                  what made cross-course access possible in the first place: scoping is a single
                  equality match on courses.id, and an account holding three of them has no single
                  scope to match. The backend refuses anything but one (validate.js
                  adminCreateSchema).

                  The list comes from GET /api/courses, not the hardcoded COURSES constant. That
                  constant is still correct -- those ARE the program codes -- but it is a second
                  copy, and it disagrees silently the moment the Super Admin adds a course: the
                  form would offer a code the backend rejects as unknown.
                */}
                <div className="form-group">
                  <label>Course *</label>
                  <select
                    value={form.courseId}
                    onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                  >
                    <option value="">Select a course...</option>
                    {courseOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="course-assign-hint">
                    This admin will see and manage only this course&apos;s students, equipment,
                    rooms, borrowing, incidents and maintenance records.
                  </p>
                </div>
              </div>
            </div>

            {/*
              The Permissions chips are GONE, deliberately.

              They were never an access control: `permissions` was written to the
              profile by adminController and read by NOTHING -- not one middleware,
              controller or route consulted it. What actually decides what an admin may
              do is the course scope (middleware/courseScope.js) plus adminLevel
              (Super Admin vs Course Admin).

              Leaving the chips would have been the worst option of the three. A
              Super Admin could tick "View Catalog" off, watch the form save, and see
              no effect -- and the natural conclusion would be that access control is
              broken, not that the control is imaginary. It would also have made the
              course field read as one of several independent permissions, which is
              the opposite of how it works: the course IS the permission.

              The field itself is still sent on save, and is still stored, so existing
              rows round-trip unchanged. It is simply no longer editable or implied.
            */}

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
