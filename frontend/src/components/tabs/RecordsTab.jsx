import { useState, useEffect } from "react";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

const EMPTY_FORM = { studentName: "", studentId: "", subjectCode: "", subjectName: "", score: "", grade: "", status: "Pending", semester: "", year: "" };

export default function RecordsTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    try {
      const data = await api.getRecords();
      setRecords(data);
    } catch {
      toast.error("Failed to load records");
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter((r) => {
    const matchSearch = !search || (r.studentName || "").toLowerCase().includes(search.toLowerCase()) || (r.studentId || "").includes(search) || (r.subjectCode || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || (r.status || "") === filterStatus;
    return matchSearch && matchStatus;
  });

  function openAdd() { setForm(EMPTY_FORM); setEditing(null); setShowModal(true); }
  function openEdit(r) { setForm({ ...EMPTY_FORM, ...r }); setEditing(r.id); setShowModal(true); }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateRecord(editing, form);
        toast.success("Record updated");
      } else {
        await api.createRecord(form);
        toast.success("Record added");
      }
      setShowModal(false);
      loadRecords();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this record?")) return;
    try {
      await api.deleteRecord(id);
      toast.success("Record deleted");
      loadRecords();
    } catch (err) { toast.error(err.message); }
  }

  function statusClass(s) {
    const v = (s || "").toLowerCase();
    if (v === "passed" || v === "completed") return "passed";
    if (v === "failed") return "failed";
    if (v === "in progress") return "in-progress";
    return "pending";
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2>Academic Records</h2>
        <div className="records-filters">
          <input placeholder="Search student, ID, subject..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option>All</option>
            <option>Passed</option>
            <option>Failed</option>
            <option>Pending</option>
            <option>In Progress</option>
          </select>
          <button className="btn btn-green" onClick={openAdd}>+ Add Record</button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>ID</th>
              <th>Subject</th>
              <th>Score</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Semester</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="8" className="empty-state">No records found</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.studentName}</td>
                <td>{r.studentId}</td>
                <td>{r.subjectCode} - {r.subjectName}</td>
                <td>{r.score}</td>
                <td><strong>{r.grade}</strong></td>
                <td><span className={`status-badge ${statusClass(r.status)}`}>{r.status}</span></td>
                <td>{r.semester} {r.year}</td>
                <td className="actions">
                  <button className="btn-sm btn-edit" onClick={() => openEdit(r)}>Edit</button>
                  <button className="btn-sm btn-delete" onClick={() => handleDelete(r.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Record" : "Add Record"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <input placeholder="Student Name" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} required />
            <input placeholder="Student ID" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required />
            <input placeholder="Subject Code" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value })} required />
            <input placeholder="Subject Name" value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} required />
            <input type="number" placeholder="Score" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            <input placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Passed</option>
              <option>Failed</option>
            </select>
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>
              <option value="">Select Semester</option>
              <option>1st</option>
              <option>2nd</option>
              <option>Summer</option>
            </select>
            <input placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
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
