import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { SECTIONS } from "../constants/sections";
import Modal from "../components/ui/Modal";
import toast from "react-hot-toast";
import {
  MdAdd, MdSearch, MdEdit, MdDelete, MdCheckCircle, MdCancel,
  MdEvent, MdRoom, MdPerson, MdSchedule, MdLogin, MdArrowBack,
  MdDownload, MdVisibility, MdFilterList, MdEventBusy, MdAccessTime,
  MdPeople, MdAssignment, MdInfoOutline, MdLocationOn,
} from "react-icons/md";
import "../styles/pages/lab-activity.css";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

const STATUS_CONFIG = {
  upcoming: { color: "#1976d2", bg: "#e3f2fd", label: "Upcoming" },
  ongoing: { color: "#2e7d32", bg: "#e8f5e9", label: "Ongoing" },
  completed: { color: "#757575", bg: "#f5f5f5", label: "Completed" },
};

const EMPTY_FORM = {
  title: "", subject: "", description: "", date: "", startTime: "", endTime: "",
  course: "", year: "", section: "", room: "", instructor: "", status: "upcoming",
};

function formatDate(dateVal) {
  if (!dateVal) return "-";
  if (typeof dateVal === "object" && dateVal.seconds != null) {
    return new Date(dateVal.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  if (d?.toDate) return d.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(timeVal) {
  if (!timeVal) return "-";
  if (typeof timeVal === "object" && timeVal.seconds != null) {
    return new Date(timeVal.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const str = String(timeVal);
  if (str.includes("T")) {
    return new Date(str).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return str;
}

export default function LabActivityPage() {
  const { role, userProfile } = useAuth();
  const isAdmin = role === "admin";
  const uid = userProfile?.id || "";

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [filterSection, setFilterSection] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [nonAttendees, setNonAttendees] = useState([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attSearch, setAttSearch] = useState("");
  const [showNonAttendees, setShowNonAttendees] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = isAdmin ? await api.getLabActivities() : await api.getMyLabActivities();
      setActivities(data || []);
    } catch {
      toast.error("Failed to load activities");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = activities;
    if (filterCourse !== "All") result = result.filter((a) => a.course === filterCourse);
    if (filterYear !== "All") result = result.filter((a) => a.year === filterYear);
    if (filterSection !== "All") result = result.filter((a) => a.section === filterSection);
    if (filterStatus !== "All") result = result.filter((a) => a.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        (a.title || "").toLowerCase().includes(q) ||
        (a.subject || "").toLowerCase().includes(q) ||
        (a.room || "").toLowerCase().includes(q) ||
        (a.instructor || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [activities, filterCourse, filterYear, filterSection, filterStatus, search]);

  const handleCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const handleEdit = (activity) => {
    setEditing(activity);
    setForm({
      title: activity.title || "",
      subject: activity.subject || "",
      description: activity.description || "",
      date: activity.date || "",
      startTime: activity.startTime || "",
      endTime: activity.endTime || "",
      course: activity.course || "",
      year: activity.year || "",
      section: activity.section || "",
      room: activity.room || "",
      instructor: activity.instructor || "",
      status: activity.status || "upcoming",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.subject || !form.date || !form.startTime || !form.endTime || !form.course || !form.year || !form.section || !form.room) {
      return toast.error("All required fields must be filled");
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateLabActivity(editing.id, form);
        toast.success("Activity updated");
      } else {
        await api.createLabActivity(form);
        toast.success("Activity created");
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this activity? This will also remove all attendance records.")) return;
    try {
      await api.deleteLabActivity(id);
      toast.success("Activity deleted");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleJoin = async (activityId) => {
    try {
      const res = await api.joinLabSession(activityId);
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to join");
    }
  };

  const handleViewAttendees = async (activity) => {
    setSelectedActivity(activity);
    setAttLoading(true);
    try {
      const [att, nonAtt] = await Promise.all([
        api.getSessionAttendees(activity.id),
        api.getSessionNonAttendees(activity.id),
      ]);
      setAttendees(att || []);
      setNonAttendees(nonAtt || []);
    } catch {
      toast.error("Failed to load attendees");
    } finally {
      setAttLoading(false);
    }
  };

  const handleExportCSV = (activity) => {
    const headers = ["Student Name", "School ID", "Course", "Year", "Section", "Login Time", "Status"];
    const rows = attendees.map((a) => [
      `${a.firstName} ${a.lastName}`, a.schoolId, a.course, a.year, a.section,
      formatDate(a.loginTime), a.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${(activity.title || "Untitled").replace(/\s+/g, "_")}_${activity.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="lab-activity-page">
      <div className="lab-hero">
        <div className="lab-hero-glow lab-hero-glow-1" />
        <div className="lab-hero-glow lab-hero-glow-2" />
        <div className="lab-hero-content">
          <span className="lab-hero-eyebrow">{isAdmin ? "Administrator" : "Student"}</span>
          <h1>{isAdmin ? "Lab Activity Management" : "My Lab Activities"}</h1>
          <p className="lab-hero-sub">{isAdmin ? "Create and manage laboratory sessions" : "View and join your lab sessions"}</p>
          {isAdmin && (
            <button className="lab-create-hero-btn" onClick={handleCreate} disabled={saving}>
              <MdAdd size={18} /> Create Activity
            </button>
          )}
        </div>
        <div className="lab-hero-art">
          <MdEvent />
        </div>
      </div>

      {isAdmin && (
        <div className="lab-activity-stats">
          <div className="lab-stat blue">
            <div className="lab-stat-icon"><MdEvent size={20} /></div>
            <div className="lab-stat-info">
              <span className="lab-stat-value">{activities.length}</span>
              <span className="lab-stat-label">Total Activities</span>
            </div>
          </div>
          <div className="lab-stat amber">
            <div className="lab-stat-icon"><MdAccessTime size={20} /></div>
            <div className="lab-stat-info">
              <span className="lab-stat-value">{activities.filter((a) => a.status === "upcoming").length}</span>
              <span className="lab-stat-label">Upcoming</span>
            </div>
          </div>
          <div className="lab-stat green">
            <div className="lab-stat-icon"><MdEventBusy size={20} /></div>
            <div className="lab-stat-info">
              <span className="lab-stat-value">{activities.filter((a) => a.status === "ongoing").length}</span>
              <span className="lab-stat-label">Ongoing</span>
            </div>
          </div>
          <div className="lab-stat purple">
            <div className="lab-stat-icon"><MdCheckCircle size={20} /></div>
            <div className="lab-stat-info">
              <span className="lab-stat-value">{activities.filter((a) => a.status === "completed").length}</span>
              <span className="lab-stat-label">Completed</span>
            </div>
          </div>
        </div>
      )}

      <div className="lab-activity-toolbar">
        <div className="lab-activity-toolbar-left">
          <div className="lab-search-box">
            <MdSearch size={18} />
            <input placeholder="Search activities..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isAdmin && (
            <>
              <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
                <option value="All">All Courses</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                <option value="All">All Years</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
                <option value="All">All Sections</option>
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="All">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="lab-activity-empty">
          <div className="lab-activity-empty-icon">
            <MdEvent size={36} />
          </div>
          <h3>{search || filterStatus !== "All" || filterCourse !== "All" ? "No matching activities" : "No lab activities yet"}</h3>
          <p>{isAdmin ? "Create your first lab activity to get started" : "No activities available for your course/year/section"}</p>
          {isAdmin && (
            <button className="btn btn-green" onClick={handleCreate}>
              <MdAdd size={16} /> Create Activity
            </button>
          )}
        </div>
      ) : (
        <div className="lab-activity-grid">
          {filtered.map((activity) => {
            const sc = STATUS_CONFIG[activity.status] || STATUS_CONFIG.upcoming;
            const isJoined = activity.joined;
            return (
              <div className="lab-activity-card" key={activity.id}>
                <div className="lab-activity-card-accent" style={{ background: sc.color }} />
                <div className="lab-activity-card-body">
                  <div className="lab-activity-card-header">
                    <h3>{activity.title}</h3>
                    <span className="lab-status-badge" style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </div>
                  <p className="lab-activity-subject">{activity.subject}</p>
                  {activity.description && <p className="lab-activity-desc">{activity.description}</p>}
                  <div className="lab-activity-meta">
                    <span><MdEvent size={14} /> {formatDate(activity.date)}</span>
                    <span><MdSchedule size={14} /> {formatTime(activity.startTime)} - {formatTime(activity.endTime)}</span>
                    <span><MdRoom size={14} /> {activity.room}</span>
                    {activity.instructor && <span><MdPerson size={14} /> {activity.instructor}</span>}
                  </div>
                  <div className="lab-activity-tags">
                    <span className="lab-tag">{activity.course}</span>
                    <span className="lab-tag year-tag">{activity.year}</span>
                    <span className="lab-tag section-tag">Sec. {activity.section}</span>
                  </div>
                  <div className="lab-activity-card-actions">
                    {isAdmin ? (
                      <>
                        <button className="btn btn-sm btn-outline" onClick={() => handleViewAttendees(activity)}>
                          <MdPeople size={14} /> Attendees
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={() => handleEdit(activity)}>
                          <MdEdit size={14} /> Edit
                        </button>
                        <button className="btn btn-sm btn-danger-outline" onClick={() => handleDelete(activity.id)}>
                          <MdDelete size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        className={`btn btn-sm ${isJoined ? "btn-joined" : "btn-green"}`}
                        onClick={() => handleJoin(activity.id)}
                        disabled={isJoined || activity.status === "completed"}
                      >
                        {isJoined ? <><MdCheckCircle size={14} /> Joined</> : <><MdLogin size={14} /> Join Session</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={`lab-slide-panel ${showForm ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>{editing ? "Edit Lab Activity" : "Create Lab Activity"}</h2>
          <button className="lab-slide-close" onClick={() => { setShowForm(false); setEditing(null); }}>
            <MdCancel size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />

          <div className="lab-form-section">
            <div className="lab-form-section-header">
              <div className="lab-form-section-icon details"><MdInfoOutline size={14} /></div>
              <span className="lab-form-section-title">Session Details</span>
            </div>
            <div className="lab-form-row">
              <div className="lab-form-field">
                <label>Title <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lab 1: Hello World" />
                  <MdEdit size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Subject <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Computer Programming" />
                  <MdAssignment size={16} />
                </div>
              </div>
            </div>
            <div className="lab-form-field">
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the lab activity objectives and tasks..." />
            </div>
          </div>

          <div className="lab-form-section">
            <div className="lab-form-section-header">
              <div className="lab-form-section-icon schedule"><MdSchedule size={14} /></div>
              <span className="lab-form-section-title">Schedule</span>
            </div>
            <div className="lab-form-row">
              <div className="lab-form-field">
                <label>Date <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  <MdEvent size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Start Time <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  <MdAccessTime size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>End Time <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                  <MdAccessTime size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="lab-form-section">
            <div className="lab-form-section-header">
              <div className="lab-form-section-icon class"><MdPeople size={14} /></div>
              <span className="lab-form-section-title">Class Assignment</span>
            </div>
            <div className="lab-form-row">
              <div className="lab-form-field">
                <label>Course <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
                    <option value="">Select course</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MdAssignment size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Year <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <MdPeople size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Section <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="e.g. A, 4A, B1" />
                  <MdPeople size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="lab-form-section">
            <div className="lab-form-section-header">
              <div className="lab-form-section-icon location"><MdRoom size={14} /></div>
              <span className="lab-form-section-title">Location & Staff</span>
            </div>
            <div className="lab-form-row">
              <div className="lab-form-field">
                <label>Room <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Computer Lab 1, Room 204" />
                  <MdLocationOn size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Instructor</label>
                <div className="lab-input-wrap">
                  <input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Prof. name" />
                  <MdPerson size={16} />
                </div>
              </div>
              <div className="lab-form-field">
                <label>Status</label>
                <div className="lab-input-wrap">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                  <MdEvent size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="lab-form-actions">
            <button className="lab-form-cancel-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            <button className="lab-form-submit-btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update Activity" : "Create Activity"}
            </button>
          </div>
        </div>
      </div>
      {showForm && <div className="lab-slide-backdrop" onClick={() => { setShowForm(false); setEditing(null); }} />}

      {selectedActivity && (
        <Modal title={`Attendance - ${selectedActivity.title}`} onClose={() => { setSelectedActivity(null); setAttendees([]); setNonAttendees([]); setShowNonAttendees(false); }}>
          <div className="lab-attendance-modal">
            <div className="lab-attendance-header">
              <div className="lab-attendance-stats-row">
                <span className="lab-att-stat"><MdPeople size={16} /> Present: <strong>{attendees.length}</strong></span>
                <span className="lab-att-stat"><MdEventBusy size={16} /> Absent: <strong>{nonAttendees.length}</strong></span>
              </div>
              <div className="lab-attendance-actions-row">
                <button className="btn btn-sm btn-outline" onClick={() => setShowNonAttendees(!showNonAttendees)}>
                  {showNonAttendees ? <><MdCheckCircle size={14} /> View Present</> : <><MdCancel size={14} /> View Absent</>}
                </button>
                <button className="btn btn-sm btn-green" onClick={() => handleExportCSV(selectedActivity)}>
                  <MdDownload size={14} /> Export CSV
                </button>
              </div>
            </div>
            <div className="lab-att-search">
              <MdSearch size={16} />
              <input placeholder="Search students..." value={attSearch} onChange={(e) => setAttSearch(e.target.value)} />
            </div>
            {attLoading ? (
              <div className="page-loading"><div className="spinner-lg" /></div>
            ) : showNonAttendees ? (
              nonAttendees.length === 0 ? (
                <div className="lab-att-empty">All students attended!</div>
              ) : (
                <div className="lab-att-table-wrap">
                  <table className="lab-att-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>School ID</th>
                        <th>Course</th>
                        <th>Year</th>
                        <th>Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonAttendees.filter((a) => {
                        if (!attSearch) return true;
                        const q = attSearch.toLowerCase();
                        return `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) || a.schoolId?.toLowerCase().includes(q);
                      }).map((s, i) => (
                        <tr key={i}>
                          <td>{s.firstName} {s.lastName}</td>
                          <td>{s.schoolId}</td>
                          <td>{s.course}</td>
                          <td>{s.year}</td>
                          <td>{s.section}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              attendees.length === 0 ? (
                <div className="lab-att-empty">No attendees yet</div>
              ) : (
                <div className="lab-att-table-wrap">
                  <table className="lab-att-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>School ID</th>
                        <th>Course</th>
                        <th>Year</th>
                        <th>Section</th>
                        <th>Login Time</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.filter((a) => {
                        if (!attSearch) return true;
                        const q = attSearch.toLowerCase();
                        return `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) || a.schoolId?.toLowerCase().includes(q);
                      }).map((a) => (
                        <tr key={a.id}>
                          <td>{a.firstName} {a.lastName}</td>
                          <td>{a.schoolId}</td>
                          <td>{a.course}</td>
                          <td>{a.year}</td>
                          <td>{a.section}</td>
                          <td>{formatDate(a.loginTime)} {formatTime(a.loginTime)}</td>
                          <td>
                            <span className={`lab-att-status ${a.status}`}>
                              {a.status === "present" ? "Present" : "Absent"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
