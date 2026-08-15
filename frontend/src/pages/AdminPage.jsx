import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { MdAdd, MdList, MdLogout, MdPerson, MdLock, MdPhone, MdWork, MdEmail, MdArrowBack, MdShield, MdEdit, MdDelete } from "react-icons/md";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import toast from "react-hot-toast";
import "../styles/pages/admin.css";

export default function AdminPage() {
  const [view, setView] = useState("main");
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "", contact: "", position: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      setForm({ firstName: "", lastName: "", password: "", contact: "", position: "", email: "" });
      setView("list");
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this account?")) return;
    try { await api.deleteAdmin(id); toast.success("Deleted!"); loadAdmins(); }
    catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async (id) => {
    const admin = admins.find((a) => a.id === id);
    if (!admin) return;
    const firstname = prompt("First name:", admin.firstname || admin.firstName || "");
    if (firstname === null) return;
    const lastname = prompt("Last name:", admin.lastname || admin.lastName || "");
    if (lastname === null) return;
    const position = prompt("Position:", admin.position || "");
    const contact = prompt("Contact:", admin.contact || "");
    const password = prompt("New password (blank to keep):", "");
    try {
      await api.updateAdmin(id, { firstName: firstname, lastName: lastname, position, contact, password: password || undefined });
      toast.success("Updated!"); loadAdmins();
    } catch (err) { toast.error(err.message); }
  };

  const handleLogout = async () => { await logout(); navigate("/login"); };

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
            <button className="admin-action-card" onClick={handleLogout}>
              <div className="admin-action-icon red"><MdLogout size={28} /></div>
              <span className="admin-action-label">Logout</span>
              <span className="admin-action-desc">Sign out of admin panel</span>
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
          </div>

          {error ? (
            <ErrorState message={error} onRetry={loadAdmins} />
          ) : admins.length === 0 ? (
            <EmptyState message="No admin accounts found." />
          ) : (
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
                    <div className="admin-account-actions">
                      <button className="admin-btn-edit" onClick={() => handleUpdate(a.id)}>
                        <MdEdit size={14} /> Edit
                      </button>
                      <button className="admin-btn-delete" onClick={() => handleDelete(a.id)}>
                        <MdDelete size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
