import { useState, useMemo } from "react";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import Modal from "../components/ui/Modal";
import TransactionDetail from "../components/transactions/TransactionDetail";
import { toTxnView } from "../components/transactions/txnView";
import { MdSearch, MdPerson, MdSchool, MdEmail, MdPhone, MdBookmark, MdAssignmentReturn, MdInventory, MdDownload } from "react-icons/md";
import "../styles/pages/persona.css";

export default function PersonaPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [result, setResult] = useState(null);
  const [persona, setPersona] = useState(null);
  const [loading, setLoading] = useState(false);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDownload, setShowDownload] = useState(false);
  const [dlType, setDlType] = useState("all");
  const [dlStatus, setDlStatus] = useState("All");
  const [dlDateRange] = useState("all");
  const [dlFrom, setDlFrom] = useState("");
  const [dlTo, setDlTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [abCourse, setAbCourse] = useState("All");
  const [abRoom, setAbRoom] = useState("All");
  const [abStudent, setAbStudent] = useState("");
  const [abStatus, setAbStatus] = useState("All");
  const [selectedTx, setSelectedTx] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true); setError(""); setResult(null); setPersona(null);
    try {
      const data = await api.searchUser(firstName.trim(), lastName.trim());
      setResult(data);
      const user = data?.user;
      if (user?.role === "admin") {
        setPersonaLoading(true);
        try {
          const p = await api.getPersona(user.id);
          setPersona(p);
        } catch {
          setPersona(null);
        } finally {
          setPersonaLoading(false);
        }
      }
    } catch (err) {
      setError(err.message || "No person found");
    } finally { setLoading(false); }
  };

  const user = result?.user;
  const initials = user ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() : "?";
  const isAdmin = user?.role === "admin";

  const activeRows = useMemo(() => {
    const list = persona?.activeBorrowings || [];
    return list.filter((t) => {
      if (abCourse !== "All" && t.course !== abCourse && t.equipmentCourse !== abCourse && t.equipment_course !== abCourse) return false;
      if (abRoom !== "All" && t.equipmentCourse !== abRoom && t.course !== abRoom) return false;
      if (abStatus !== "All" && String(t.status || "").toLowerCase() !== abStatus.toLowerCase()) return false;
      if (abStudent.trim()) {
        const q = abStudent.trim().toLowerCase();
        const name = `${t.firstName || t.first_name || ""} ${t.lastName || t.last_name || ""} ${t.schoolId || t.school_id || ""}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (dlFrom) {
        const d = new Date(t.borrowedAt || t.borrowed_at || t.timestamp);
        const from = new Date(dlFrom);
        if (!Number.isNaN(d.getTime()) && !Number.isNaN(from.getTime()) && d < from) return false;
      }
      if (dlTo) {
        const d = new Date(t.borrowedAt || t.borrowed_at || t.timestamp);
        const to = new Date(dlTo); to.setHours(23,59,59,999);
        if (!Number.isNaN(d.getTime()) && !Number.isNaN(to.getTime()) && d > to) return false;
      }
      return true;
    });
  }, [persona, abCourse, abRoom, abStudent, abStatus, dlFrom, dlTo]);

  const activeSummary = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const totalItems = activeRows.reduce((s, t) => s + (Number(t.quantityRemaining ?? t.quantity_remaining ?? t.quantity) || 0), 0);
    const overdue = activeRows.filter((t) => {
      const due = new Date(t.dueDate || t.due_date);
      return !Number.isNaN(due.getTime()) && due.getTime() < now && String(t.status || "").toLowerCase() !== "returned";
    }).length;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
    const dueToday = activeRows.filter((t) => {
      const due = new Date(t.dueDate || t.due_date);
      return !Number.isNaN(due.getTime()) && due.getTime() >= todayStart.getTime() && due.getTime() <= todayEnd.getTime();
    }).length;
    return { total: activeRows.length, items: totalItems, overdue, dueToday };
  }, [activeRows]);

  const handleDownload = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const params = { type: dlType };
      if (dlDateRange !== "all") {
        // reuse date range options semantics: custom only if from/to
      }
      if (dlFrom) params.dateFrom = dlFrom;
      if (dlTo) params.dateTo = dlTo;
      if (dlStatus && dlStatus !== "All") params.status = dlStatus;
      await api.downloadPersonaReport(user.id, params);
      setShowDownload(false);
    } catch (err) {
      alert(err.message || "Download failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="persona-page">
      <div className="persona-search-card">
        <form onSubmit={handleSearch}>
          <div className="persona-row">
            <div className="persona-input-wrap">
              <MdPerson className="persona-input-icon" size={20} />
              <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="persona-input-wrap">
              <MdPerson className="persona-input-icon" size={20} />
              <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="persona-search-btn" disabled={loading}>
            <MdSearch size={20} />
            {loading ? "Searching..." : "Find Person"}
          </button>
        </form>
      </div>

      {error && (
        <div className="persona-error-card">
          <MdPerson size={24} />
          <p>{error}</p>
        </div>
      )}

      {result && user && (
        <div className="persona-result fade-in-up">
          <div className="persona-profile-card">
            <div className="persona-avatar" style={user.profileURL ? { background: "transparent" } : {}}>
              {user.profileURL ? (
                <img src={user.profileURL} alt={`${user.firstName} ${user.lastName}`} />
              ) : (
                initials
              )}
            </div>
            <div className="persona-profile-info">
              <h2 className="persona-name">{user.firstName} {user.lastName}</h2>
              <span className="persona-role-badge">{user.role || "Student"}</span>
              {isAdmin && (
                <button type="button" className="btn btn-primary" style={{ marginLeft: 12 }} onClick={() => setShowDownload(true)}>
                  <MdDownload size={16} /> Download Report
                </button>
              )}
            </div>
          </div>

          <div className="persona-details-grid">
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdSchool size={18} /></div>
              <div>
                <span className="persona-detail-label">School ID</span>
                <span className="persona-detail-value">{user.schoolId || user.schoolID || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdBookmark size={18} /></div>
              <div>
                <span className="persona-detail-label">Course</span>
                <span className="persona-detail-value">{user.course || persona?.course?.name || persona?.user?.courseId || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdPhone size={18} /></div>
              <div>
                <span className="persona-detail-label">Contact</span>
                <span className="persona-detail-value">{user.contact || user.contactNumber || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdEmail size={18} /></div>
              <div>
                <span className="persona-detail-label">Email</span>
                <span className="persona-detail-value">{user.email || "-"}</span>
              </div>
            </div>
          </div>

          {isAdmin && personaLoading && <p>Loading records...</p>}

          {isAdmin && persona && (
            <>
              <div className="persona-items-section">
                <div className="persona-items-card persona-borrowed-card">
                  <div className="persona-items-header">
                    <MdSchool size={20} />
                    <h3>Laboratory Rooms</h3>
                    <span className="persona-count-badge borrowed">{persona.counts?.rooms ?? (persona.rooms?.length || 0)}</span>
                  </div>
                  <div className="persona-items-list">
                    {(persona.rooms || []).length ? persona.rooms.map((r, idx) => (
                      <div className="persona-item-chip borrowed" key={idx}>
                        <span className="persona-item-name">{r.roomName || r.room_name || r.roomCode || r.room_code}</span>
                      </div>
                    )) : <p className="persona-empty-text">No rooms</p>}
                  </div>
                </div>

                <div className="persona-items-card persona-returned-card">
                  <div className="persona-items-header">
                    <MdPerson size={20} />
                    <h3>Students</h3>
                    <span className="persona-count-badge returned">{persona.counts?.students ?? (persona.students?.length || 0)}</span>
                  </div>
                  <div className="persona-items-list">
                    {(persona.students || []).length ? persona.students.slice(0, 12).map((s, idx) => (
                      <div className="persona-item-chip returned" key={idx}>
                        <span className="persona-item-name">{s.firstName} {s.lastName}</span>
                        <span className="persona-item-qty">{s.schoolId}</span>
                      </div>
                    )) : <p className="persona-empty-text">No students</p>}
                  </div>
                </div>
              </div>

              <div className="persona-items-section">
                <div className="persona-items-card persona-borrowed-card">
                  <div className="persona-items-header">
                    <MdInventory size={20} />
                    <h3>Borrowed/Transactions</h3>
                    <span className="persona-count-badge borrowed">{persona.counts?.transactions ?? 0}</span>
                  </div>
                  <div className="persona-items-list">
                    {(persona.transactions || []).length ? persona.transactions.slice(0, 10).map((t, idx) => (
                      <div className="persona-item-chip borrowed" key={idx}>
                        <span className="persona-item-name">{t.itemName || t.item_name || "Item"}</span>
                        <span className="persona-item-qty">x{t.quantity || 1}</span>
                      </div>
                    )) : <p className="persona-empty-text">No transactions</p>}
                  </div>
                </div>

                <div className="persona-items-card persona-returned-card">
                  <div className="persona-items-header">
                    <MdAssignmentReturn size={20} />
                    <h3>Overdue</h3>
                    <span className="persona-count-badge returned">{persona.counts?.overdue ?? 0}</span>
                  </div>
                  <div className="persona-items-list">
                    {(persona.overdue || []).length ? persona.overdue.slice(0, 10).map((t, idx) => (
                      <div className="persona-item-chip returned" key={idx}>
                        <span className="persona-item-name">{t.itemName || t.item_name || "Item"}</span>
                      </div>
                    )) : <p className="persona-empty-text">No overdue items</p>}
                  </div>
                </div>
              </div>

              <div className="persona-active-borrowings">
                <h3>Active Borrowings</h3>
                <div className="persona-ab-summary">
                  <div className="persona-ab-stat">
                    <span className="persona-ab-stat-label">Total active</span>
                    <span className="persona-ab-stat-value">{activeSummary.total}</span>
                  </div>
                  <div className="persona-ab-stat">
                    <span className="persona-ab-stat-label">Items borrowed</span>
                    <span className="persona-ab-stat-value">{activeSummary.items}</span>
                  </div>
                  <div className="persona-ab-stat">
                    <span className="persona-ab-stat-label">Overdue</span>
                    <span className="persona-ab-stat-value">{activeSummary.overdue}</span>
                  </div>
                  <div className="persona-ab-stat">
                    <span className="persona-ab-stat-label">Due today</span>
                    <span className="persona-ab-stat-value">{activeSummary.dueToday}</span>
                  </div>
                </div>
                <div className="persona-ab-filters">
                  <select value={abCourse} onChange={(e) => setAbCourse(e.target.value)}>
                    <option value="All">All Courses</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={abRoom} onChange={(e) => setAbRoom(e.target.value)}>
                    <option value="All">All Rooms</option>
                    {(persona.rooms || []).map((r, idx) => {
                      const code = r.roomCode || r.room_code || r.roomName || r.room_name;
                      return <option key={idx} value={code}>{code}</option>;
                    })}
                  </select>
                  <input type="text" placeholder="Student name or ID" value={abStudent} onChange={(e) => setAbStudent(e.target.value)} />
                  <select value={abStatus} onChange={(e) => setAbStatus(e.target.value)}>
                    <option value="All">All Statuses</option>
                    <option value="borrowed">Borrowed</option>
                    <option value="partially_returned">Partially Returned</option>
                  </select>
                </div>
                {activeRows.length === 0 ? (
                  <p className="persona-empty-text">No active borrowings</p>
                ) : (
                  <div className="persona-ab-list">
                    {activeRows.map((t, idx) => {
                      const view = toTxnView(t, "borrowed");
                      const overdue = view.overdue;
                      return (
                        <div
                          key={idx}
                          className={`persona-ab-row${overdue?.isOverdue ? " overdue" : ""}`}
                          onClick={() => setSelectedTx(view)}
                        >
                          <div className="persona-ab-row-title">
                            <span className="persona-ab-row-name">{view.fullName || "-"}</span>
                            <span className="persona-ab-row-qty">x{view.remaining}/{view.total}</span>
                          </div>
                          <div className="persona-ab-row-meta">
                            <span>{view.schoolId || "-"}</span>
                            <span>{view.itemName}</span>
                            <span>Borrowed: {view.borrowedAt ? view.borrowedAt.toLocaleDateString() : "-"}</span>
                            <span>Due: {view.dueDate ? view.dueDate.toLocaleDateString() : "-"}</span>
                            <span>Course: {view.course || "-"}</span>
                            <span>Equipment: {view.equipmentCourse || "-"}</span>
                          </div>
                          {overdue?.isOverdue && <div className="persona-ab-row-overdue">OVERDUE {overdue.daysOverdue} days</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="persona-items-section">
                <div className="persona-items-card persona-borrowed-card">
                  <div className="persona-items-header">
                    <MdInventory size={20} />
                    <h3>Incidents</h3>
                    <span className="persona-count-badge borrowed">{persona.counts?.incidents ?? 0}</span>
                  </div>
                  <p className="persona-empty-text">Lost/Damaged: {persona.counts?.lostDamaged ?? 0} · Fines: {persona.counts?.fines ?? 0} · Attendance: {persona.counts?.attendance ?? 0}</p>
                </div>
              </div>
            </>
          )}

          {!isAdmin && (
            <div className="persona-items-section">
              <div className="persona-items-card persona-borrowed-card">
                <div className="persona-items-header">
                  <MdInventory size={20} />
                  <h3>Borrowed Items</h3>
                  <span className="persona-count-badge borrowed">{result.borrowed.length}</span>
                </div>
                <div className="persona-items-list">
                  {result.borrowed.length ? result.borrowed.map((i, idx) => (
                    <div className="persona-item-chip borrowed" key={idx}>
                      <span className="persona-item-name">{i.itemName || "Unknown"}</span>
                      <span className="persona-item-qty">x{i.quantity || 1}</span>
                    </div>
                  )) : <p className="persona-empty-text">No currently borrowed tools</p>}
                </div>
              </div>

              <div className="persona-items-card persona-returned-card">
                <div className="persona-items-header">
                  <MdAssignmentReturn size={20} />
                  <h3>Returned Items</h3>
                  <span className="persona-count-badge returned">{result.returned.length}</span>
                </div>
                <div className="persona-items-list">
                  {result.returned.length ? result.returned.map((i, idx) => (
                    <div className="persona-item-chip returned" key={idx}>
                      <span className="persona-item-name">{i.itemName || "Unknown"}</span>
                      <span className="persona-item-qty">x{i.quantity || 1}</span>
                    </div>
                  )) : <p className="persona-empty-text">No returned tools yet</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showDownload && (
        <Modal title="Download Report" onClose={() => setShowDownload(false)}>
          <div className="export-modal">
            <div className="export-modal-field">
              <span className="export-modal-label">Report Type</span>
              <select className="export-modal-select" value={dlType} onChange={(e) => setDlType(e.target.value)}>
                <option value="all">Download All Records</option>
                <option value="students">Download Student Records</option>
                <option value="transactions">Download Transactions</option>
                <option value="attendance">Download Attendance</option>
              </select>
            </div>
            <div className="export-modal-field">
              <span className="export-modal-label">Status (transactions)</span>
              <select className="export-modal-select" value={dlStatus} onChange={(e) => setDlStatus(e.target.value)}>
                <option value="All">All</option>
                <option value="borrowed">Borrowed</option>
                <option value="returned">Returned</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="export-modal-row">
              <div className="export-modal-field">
                <label className="export-modal-label">From</label>
                <input type="date" className="export-modal-select" value={dlFrom} onChange={(e) => setDlFrom(e.target.value)} />
              </div>
              <div className="export-modal-field">
                <label className="export-modal-label">To</label>
                <input type="date" className="export-modal-select" value={dlTo} onChange={(e) => setDlTo(e.target.value)} />
              </div>
            </div>
            <div className="export-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDownload(false)} disabled={exporting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={exporting}>
                {exporting ? "Preparing..." : "Download XLSX"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectedTx && (
        <Modal title={selectedTx.fullName || "Transaction Details"} onClose={() => setSelectedTx(null)}>
          <TransactionDetail view={selectedTx} />
        </Modal>
      )}
    </section>
  );
}
