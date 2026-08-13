import { useState, useEffect } from "react";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", password: "", contact: "", position: "", role: "Faculty" };

export default function MembersTab() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    try {
      const admins = await api.getAdmins();
      setMembers(admins.map((a) => ({
        id: a.id,
        name: `${a.firstname || a.firstName || ""} ${a.lastname || a.lastName || ""}`.trim(),
        email: a.email || "",
        position: a.position || "",
        role: a.role || "Admin",
        status: a.status || "Active",
        lastActive: a.lastActive || "Recently",
      })));
    } catch {
      setMembers([
        { id: "1", name: "Admin User", email: "admin@slsu.edu.ph", position: "System Administrator", role: "Admin", status: "Active", lastActive: "Now" },
        { id: "2", name: "Juan Dela Cruz", email: "jdc@slsu.edu.ph", position: "Laboratory Instructor", role: "Faculty", status: "Active", lastActive: "2 hours ago" },
        { id: "3", name: "Maria Santos", email: "msantos@slsu.edu.ph", position: "Lab Assistant", role: "Staff", status: "Active", lastActive: "1 day ago" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = members.filter((m) => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "All" || m.role === filterRole;
    return matchSearch && matchRole;
  });

  function openAdd() { setForm(EMPTY_FORM); setEditing(null); setShowModal(true); }
  function openEdit(m) {
    setForm({ firstName: m.name.split(" ")[0] || "", lastName: m.name.split(" ").slice(1).join(" ") || "", email: m.email, password: "", contact: "", position: m.position, role: m.role });
    setEditing(m.id);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateAdmin(editing, form);
        toast.success("Member updated");
      } else {
        await api.createAdmin(form);
        toast.success("Member added");
      }
      setShowModal(false);
      loadMembers();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this member?")) return;
    try {
      await api.deleteAdmin(id);
      toast.success("Member removed");
      loadMembers();
    } catch (err) { toast.error(err.message); }
  }

  function initials(name) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function roleBadgeClass(role) {
    const r = (role || "").toLowerCase();
    if (r === "admin") return "admin";
    if (r === "faculty") return "faculty";
    return "staff";
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="members-header">
        <h2>Members</h2>
        <div className="records-filters">
          <input placeholder="Search name, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option>All</option>
            <option>Admin</option>
            <option>Faculty</option>
            <option>Staff</option>
          </select>
          <button className="btn btn-green" onClick={openAdd}>+ Add Member</button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Position</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="7" className="empty-state">No members found</td></tr>
            ) : filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="member-cell">
                    <div className="member-avatar">{initials(m.name)}</div>
                    <strong>{m.name}</strong>
                  </div>
                </td>
                <td>{m.email}</td>
                <td>{m.position}</td>
                <td><span className={`role-badge ${roleBadgeClass(m.role)}`}>{m.role}</span></td>
                <td><span className={`status-badge ${m.status === "Active" ? "passed" : "pending"}`}>{m.status}</span></td>
                <td>{m.lastActive}</td>
                <td className="actions">
                  <button className="btn-sm btn-edit" onClick={() => openEdit(m)}>Edit</button>
                  <button className="btn-sm btn-delete" onClick={() => handleDelete(m.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Member" : "Add Member"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <input placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <input placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            {!editing && <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
            {editing && <input type="password" placeholder="New Password (leave blank to keep)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            <input placeholder="Contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input placeholder="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>Admin</option>
              <option>Faculty</option>
              <option>Staff</option>
            </select>
            <div className="catalog-actions">
              <button type="submit" className="btn btn-green">{editing ? "Update" : "Add"}</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
