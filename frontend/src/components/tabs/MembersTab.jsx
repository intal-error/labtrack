import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { filterBySearch } from "../../utils/search";
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
    const matchSearch = !search || filterBySearch([m], search, ["name", "email"]).length > 0;
    const matchRole = filterRole === "All" || m.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total: members.length,
    admin: members.filter((m) => m.role === "Admin").length,
    faculty: members.filter((m) => m.role === "Faculty").length,
    staff: members.filter((m) => m.role === "Staff").length,
  };

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

  function avatarColorClass(role) {
    const r = (role || "").toLowerCase();
    if (r === "admin") return "avatar-admin";
    if (r === "faculty") return "avatar-faculty";
    return "avatar-staff";
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="members-header">
        <div className="members-header-left">
          <h2>Members</h2>
          <p className="members-subtitle">Manage your team members and their roles</p>
        </div>
        <div className="records-filters">
          <div className="search-box">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option>All</option>
            <option>Admin</option>
            <option>Faculty</option>
            <option>Staff</option>
          </select>
          <button className="btn btn-green" onClick={openAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Member
          </button>
        </div>
      </div>

      <div className="members-stats">
        <div className="stat-card stat-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Members</span>
          </div>
        </div>
        <div className="stat-card stat-admin">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.admin}</span>
            <span className="stat-label">Admins</span>
          </div>
        </div>
        <div className="stat-card stat-faculty">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.faculty}</span>
            <span className="stat-label">Faculty</span>
          </div>
        </div>
        <div className="stat-card stat-staff">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.staff}</span>
            <span className="stat-label">Staff</span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="members-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <h3>No members found</h3>
          <p>Try adjusting your search or filter criteria</p>
        </div>
      ) : (
        <div className="members-grid">
          {filtered.map((m) => (
            <div className="member-card" key={m.id}>
              <div className={`member-card-accent ${avatarColorClass(m.role)}`} />
              <div className="member-card-body">
                <div className="member-card-top">
                  <div className={`member-avatar-lg ${avatarColorClass(m.role)}`}>{initials(m.name)}</div>
                  <div className="member-card-info">
                    <h4 className="member-name">{m.name}</h4>
                    <p className="member-email">{m.email}</p>
                  </div>
                </div>
                <div className="member-card-details">
                  <div className="member-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    <span>{m.position || "No position"}</span>
                  </div>
                  <div className="member-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                    <span>{m.lastActive}</span>
                  </div>
                </div>
                <div className="member-card-badges">
                  <span className={`role-badge ${roleBadgeClass(m.role)}`}>{m.role}</span>
                  <span className={`status-badge ${m.status === "Active" ? "passed" : "pending"}`}>{m.status}</span>
                </div>
                <div className="member-card-actions">
                  <button className="btn-card-edit" onClick={() => openEdit(m)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button className="btn-card-delete" onClick={() => handleDelete(m.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
