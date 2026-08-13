import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../styles/pages/admin.css";

export default function AdminPage() {
  const [view, setView] = useState("main");
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "", contact: "", position: "", email: "" });
  const [loading, setLoading] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const loadAdmins = async () => {
    try { setAdmins(await api.getAdmins()); }
    catch (err) { console.error(err); }
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

  return (
    <section className="admin-page">
      <h1>ADMIN</h1>
      {view === "main" && (
        <div className="admin-box">
          <img src="/logo.png" alt="Logo" className="admin-logo" />
          <div className="admin-actions">
            <button className="btn btn-green" onClick={() => setView("create")}>Create Account</button>
            <button className="btn btn-yellow" onClick={() => setView("list")}>Account List</button>
            <button className="btn btn-report" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      )}

      {view === "create" && (
        <div className="admin-box">
          <h2>Account Creation</h2>
          <form onSubmit={handleCreate}>
            <input type="text" placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <input type="text" placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <input type="text" placeholder="Contact Number" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input type="text" placeholder="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <div className="admin-actions">
              <button type="submit" className="btn btn-green" disabled={loading}>{loading ? "Creating..." : "Create"}</button>
              <button type="button" className="btn btn-orange" onClick={() => setView("main")}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {view === "list" && (
        <div className="admin-box">
          <h2>Account List</h2>
          <table>
            <thead><tr><th>Position</th><th>Name</th><th>Email</th><th>Action</th></tr></thead>
            <tbody>
              {admins.length === 0 ? <tr><td colSpan={4} style={{color:"#888"}}>No admin accounts found.</td></tr> :
                admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.position || "-"}</td>
                    <td>{a.firstname || a.firstName || ""} {a.lastname || a.lastName || ""}</td>
                    <td>{a.email || ""}</td>
                    <td>
                      <button className="btn btn-yellow" onClick={() => handleUpdate(a.id)}>Update</button>
                      <button className="btn btn-orange" onClick={() => handleDelete(a.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          <button className="btn btn-orange" onClick={() => setView("main")}>Close</button>
        </div>
      )}
    </section>
  );
}
