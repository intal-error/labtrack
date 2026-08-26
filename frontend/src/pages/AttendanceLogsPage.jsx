import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { SUBJECTS } from "../constants/subjects";
import { formatDuration, formatTime, getTodayString } from "../utils/attendanceHelpers";
import RoomManagementTab from "../components/tabs/RoomManagementTab";
import toast from "react-hot-toast";
import "../styles/pages/attendance.css";

import {
  MdPeople,
  MdEventNote,
  MdHistory,
  MdQrCodeScanner,
  MdSearch,
  MdRefresh,
  MdFileDownload,
  MdEdit,
  MdDelete,
  MdPersonOff,
  MdFilterList,
  MdMeetingRoom,
} from "react-icons/md";

const TABS = [
  { key: "active", label: "Currently Inside", icon: MdPeople },
  { key: "today", label: "Today's Log", icon: MdEventNote },
  { key: "history", label: "History", icon: MdHistory },
  { key: "roomAttendance", label: "Room Attendance", icon: MdMeetingRoom },
  { key: "rooms", label: "Room QR Codes", icon: MdQrCodeScanner },
];

export default function AttendanceLogsPage() {
  const [activeTab, setActiveTab] = useState("active");
  const [stats, setStats] = useState(null);
  const [activeStudents, setActiveStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [historyData, setHistoryData] = useState({ records: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  // Edit modal
  const [editModal, setEditModal] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editProfessor, setEditProfessor] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getAttendanceStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      const data = await api.getActiveStudents();
      setActiveStudents(data);
    } catch (err) {
      console.error("Failed to load active students:", err);
    }
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const data = await api.getTodayAttendance();
      setTodayRecords(data);
    } catch (err) {
      console.error("Failed to load today records:", err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (filterCourse) params.set("course", filterCourse);
      if (filterYear) params.set("year", filterYear);
      if (search) params.set("student", search);
      params.set("page", historyPage);
      params.set("limit", "50");
      const data = await api.getAttendanceHistory(params.toString());
      setHistoryData(data);
    } catch (err) {
      toast.error(err.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterCourse, filterYear, search, historyPage]);

  useEffect(() => {
    loadStats();
    loadActive();
    loadToday();
  }, [loadStats, loadActive, loadToday]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  // Auto-refresh active every 30s
  useEffect(() => {
    if (activeTab !== "active") return;
    const interval = setInterval(loadActive, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadActive]);

  function handleExport() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (filterCourse) params.set("course", filterCourse);
    if (filterYear) params.set("year", filterYear);
    if (search) params.set("student", search);
    api.exportAttendance(params.toString()).catch(() => toast.error("Export failed"));
  }

  function handleExportToday() {
    const today = getTodayString();
    api.exportAttendance(`date=${today}`).catch(() => toast.error("Export failed"));
  }

  async function openEditModal(record) {
    setEditModal(record);
    setEditSubject(record.subject || "");
    setEditProfessor(record.professor || "");
  }

  async function saveEdit() {
    if (!editModal) return;
    try {
      await api.updateAttendance(editModal.id, { subject: editSubject, professor: editProfessor });
      toast.success("Record updated");
      setEditModal(null);
      loadToday();
      loadHistory();
    } catch (err) {
      toast.error(err.message || "Failed to update");
    }
  }

  async function handleDeleteRecord(id) {
    if (!window.confirm("Delete this attendance record?")) return;
    try {
      await api.deleteAttendance(id);
      toast.success("Record deleted");
      loadToday();
      loadHistory();
      loadStats();
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  }

  return (
    <div className="attendance-page">
      {/* Hero Header */}
      <div className="attendance-header">
        <h1>Lab Attendance</h1>
        <p className="attendance-subtitle">Monitor student laboratory attendance in real-time</p>
      </div>

      <div className="attendance-shell">
        {/* Stats */}
        {stats && (
          <div className="attendance-stats">
            <div className="attendance-stat">
              <div className="attendance-stat-icon green">
                <MdPeople size={20} />
              </div>
              <div className="attendance-stat-info">
                <span className="attendance-stat-value">{stats.currentlyInside}</span>
                <span className="attendance-stat-label">Currently Inside</span>
              </div>
            </div>
            <div className="attendance-stat">
              <div className="attendance-stat-icon blue">
                <MdEventNote size={20} />
              </div>
              <div className="attendance-stat-info">
                <span className="attendance-stat-value">{stats.totalToday}</span>
                <span className="attendance-stat-label">Today's Sessions</span>
              </div>
            </div>
            <div className="attendance-stat">
              <div className="attendance-stat-icon orange">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="attendance-stat-info">
                <span className="attendance-stat-value">{formatDuration(stats.totalMinutesToday)}</span>
                <span className="attendance-stat-label">Total Hours Today</span>
              </div>
            </div>
            <div className="attendance-stat">
              <div className="attendance-stat-icon purple">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="attendance-stat-info">
                <span className="attendance-stat-value">{stats.uniqueStudentsThisWeek}</span>
                <span className="attendance-stat-label">Students This Week</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="attendance-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`attendance-tab ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={16} />
                {tab.label}
                {tab.key === "active" && activeStudents.length > 0 && (
                  <span className="tab-count">{activeStudents.length}</span>
                )}
                {tab.key === "today" && todayRecords.length > 0 && (
                  <span className="tab-count">{todayRecords.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Currently Inside Tab */}
        {activeTab === "active" && (
          <>
            <div className="attendance-toolbar">
              <div className="attendance-toolbar-left">
                <span className="attendance-live-badge">
                  <span className="attendance-live-dot" />
                  Live
                </span>
                <span className="attendance-result-count">
                  {activeStudents.length} student{activeStudents.length !== 1 ? "s" : ""} currently inside
                </span>
              </div>
              <div className="attendance-toolbar-right">
                <button className="btn btn-primary" onClick={loadActive}>
                  <MdRefresh size={14} /> Refresh
                </button>
              </div>
            </div>
            {activeStudents.length === 0 ? (
              <div className="attendance-empty">
                <div className="attendance-empty-icon">
                  <MdPeople size={28} />
                </div>
                <h3>No Students Inside</h3>
                <p>Students will appear here after scanning their QR code to time in</p>
              </div>
            ) : (
              <div className="attendance-active-list">
                {activeStudents.map((s) => (
                  <div key={s.id} className="attendance-active-card">
                    <div className="attendance-active-card-header">
                      <div className="attendance-active-avatar">
                        {(s.firstName || "?")[0]}{(s.lastName || "?")[0]}
                      </div>
                      <div>
                        <p className="attendance-active-name">{s.firstName} {s.lastName}</p>
                        <p className="attendance-active-id">{s.studentSchoolId}</p>
                      </div>
                    </div>
                    <div className="attendance-active-meta">
                      <span className="attendance-active-tag">{s.course} {s.year}</span>
                      <span className="attendance-active-tag">{s.subject}</span>
                    </div>
                    <div className="attendance-active-details">
                      <div className="attendance-active-detail">
                        <strong>Professor:</strong> {s.professor}
                      </div>
                      <div className="attendance-active-detail">
                        <strong>Room:</strong> {s.labRoom}
                      </div>
                      <div className="attendance-active-detail">
                        <strong>Time-In:</strong> {formatTime(s.timeIn)}
                      </div>
                    </div>
                    <div className="attendance-active-timer">
                      <span className="timer-value">{formatDuration(s.currentDuration || 0)}</span>
                      <span className="timer-label">Inside for</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Today's Log Tab */}
        {activeTab === "today" && (
          <>
            <div className="attendance-toolbar">
              <div className="attendance-toolbar-left">
                <span className="attendance-result-count">
                  {todayRecords.length} record{todayRecords.length !== 1 ? "s" : ""} today
                </span>
              </div>
              <div className="attendance-toolbar-right">
                <button className="btn btn-primary" onClick={handleExportToday}>
                  <MdFileDownload size={14} /> Export Today
                </button>
              </div>
            </div>
            {todayRecords.length === 0 ? (
              <div className="attendance-empty">
                <div className="attendance-empty-icon">
                  <MdEventNote size={28} />
                </div>
                <h3>No Records Today</h3>
                <p>Attendance records for today will appear here once students start scanning in</p>
              </div>
            ) : (
              <div className="attendance-table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Time-In</th>
                      <th>Time-Out</th>
                      <th>Student Name</th>
                      <th>Student ID</th>
                      <th>Course</th>
                      <th>Year</th>
                      <th>Subject</th>
                      <th>Professor</th>
                      <th>Room</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayRecords.map((r) => (
                      <tr key={r.id}>
                        <td>{formatTime(r.timeIn)}</td>
                        <td>{formatTime(r.timeOut)}</td>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{r.firstName} {r.lastName}</td>
                        <td>{r.studentSchoolId}</td>
                        <td>{r.course}</td>
                        <td>{r.year}</td>
                        <td style={{ textAlign: "left" }}>{r.subject}</td>
                        <td style={{ textAlign: "left" }}>{r.professor}</td>
                        <td>{r.labRoom}</td>
                        <td>
                          {r.totalDuration != null ? (
                            <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                          ) : "-"}
                        </td>
                        <td>
                          <span className={`attendance-status-badge ${r.status}`}>
                            {r.status === "active" ? "Inside" : "Timed Out"}
                          </span>
                        </td>
                        <td>
                          <div className="attendance-actions-cell">
                            <button className="attendance-action-btn" title="Edit" onClick={() => openEditModal(r)}>
                              <MdEdit size={14} />
                            </button>
                            <button className="attendance-action-btn danger" title="Delete" onClick={() => handleDeleteRecord(r.id)}>
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
          </>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <>
            <div className="attendance-toolbar">
              <div className="attendance-toolbar-left">
                <div className="attendance-search">
                  <MdSearch className="search-icon" size={16} />
                  <input
                    type="text"
                    placeholder="Search student name or ID..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setHistoryPage(1); }}
                  />
                </div>
                <select className="attendance-filter-select" value={filterCourse} onChange={(e) => { setFilterCourse(e.target.value); setHistoryPage(1); }}>
                  <option value="">All Courses</option>
                  {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="attendance-filter-select" value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setHistoryPage(1); }}>
                  <option value="">All Years</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>
              <div className="attendance-toolbar-right">
                <button className="btn btn-primary" onClick={handleExport}>
                  <MdFileDownload size={14} /> Export Excel
                </button>
              </div>
            </div>

            <div className="attendance-toolbar" style={{ marginTop: -8 }}>
              <div className="attendance-toolbar-left">
                <div className="attendance-date-filter">
                  <label>From:</label>
                  <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setHistoryPage(1); }} />
                </div>
                <div className="attendance-date-filter">
                  <label>To:</label>
                  <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setHistoryPage(1); }} />
                </div>
                {(search || filterCourse || filterYear || dateFrom || dateTo) && (
                  <button className="btn btn-secondary" onClick={() => {
                    setSearch(""); setFilterCourse(""); setFilterYear(""); setDateFrom(""); setDateTo(""); setHistoryPage(1);
                  }}>
                    Clear Filters
                  </button>
                )}
              </div>
              <div className="attendance-toolbar-left">
                <span className="attendance-result-count">
                  {historyData.total} record{historyData.total !== 1 ? "s" : ""} found
                </span>
              </div>
            </div>

            {loading ? (
              <div className="attendance-empty">
                <div className="spinner-lg" />
                <h3>Loading records...</h3>
              </div>
            ) : historyData.records.length === 0 ? (
              <div className="attendance-empty">
                <div className="attendance-empty-icon">
                  <MdHistory size={28} />
                </div>
                <h3>No Records Found</h3>
                <p>Try adjusting your filters or date range to find attendance records</p>
              </div>
            ) : (
              <>
                <div className="attendance-table-wrapper">
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time-In</th>
                        <th>Time-Out</th>
                        <th>Student Name</th>
                        <th>Student ID</th>
                        <th>Course</th>
                        <th>Year</th>
                        <th>Subject</th>
                        <th>Professor</th>
                        <th>Room</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.records.map((r) => (
                        <tr key={r.id}>
                          <td>{r.date}</td>
                          <td>{formatTime(r.timeIn)}</td>
                          <td>{formatTime(r.timeOut)}</td>
                          <td style={{ textAlign: "left", fontWeight: 600 }}>{r.firstName} {r.lastName}</td>
                          <td>{r.studentSchoolId}</td>
                          <td>{r.course}</td>
                          <td>{r.year}</td>
                          <td style={{ textAlign: "left" }}>{r.subject}</td>
                          <td style={{ textAlign: "left" }}>{r.professor}</td>
                          <td>{r.labRoom}</td>
                          <td>
                            {r.totalDuration != null ? (
                              <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                            ) : "-"}
                          </td>
                          <td>
                            <span className={`attendance-status-badge ${r.status}`}>
                              {r.status === "active" ? "Inside" : "Timed Out"}
                            </span>
                          </td>
                          <td>
                            <div className="attendance-actions-cell">
                              <button className="attendance-action-btn" title="Edit" onClick={() => openEditModal(r)}>
                                <MdEdit size={14} />
                              </button>
                              <button className="attendance-action-btn danger" title="Delete" onClick={() => handleDeleteRecord(r.id)}>
                                <MdDelete size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {historyData.totalPages > 1 && (
                  <div className="attendance-pagination">
                    <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>Prev</button>
                    <span className="page-info">Page {historyData.page} of {historyData.totalPages}</span>
                    <button disabled={historyPage >= historyData.totalPages} onClick={() => setHistoryPage((p) => p + 1)}>Next</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Room Attendance Tab */}
        {activeTab === "roomAttendance" && <RoomAttendanceView />}

        {/* Room Management Tab */}
        {activeTab === "rooms" && <RoomManagementTab />}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="attendance-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="attendance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Attendance Record</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-8px 0 16px" }}>
              {editModal.firstName} {editModal.lastName} &mdash; {editModal.date}
            </p>
            <div className="attendance-edit-form">
              <label>Subject</label>
              <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)}>
                <option value="">Select Subject</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label>Professor</label>
              <input type="text" value={editProfessor} onChange={(e) => setEditProfessor(e.target.value)} />
              <div className="attendance-edit-actions">
                <button className="btn btn-outline" onClick={() => setEditModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomAttendanceView() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRooms().then((data) => {
      setRooms(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="attendance-empty"><div className="spinner-lg" /><h3>Loading rooms...</h3></div>;
  }

  if (rooms.length === 0) {
    return (
      <div className="attendance-empty">
        <div className="attendance-empty-icon"><MdMeetingRoom size={28} /></div>
        <h3>No Rooms Found</h3>
        <p>Add laboratory rooms in the "Room QR Codes" tab first</p>
      </div>
    );
  }

  return (
    <>
      <div className="attendance-toolbar">
        <div className="attendance-toolbar-left">
          <span className="attendance-result-count">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} — Click a room to view its attendance
          </span>
        </div>
      </div>
      <div className="room-attendance-grid">
        {rooms.map((room) => (
          <div key={room.id} className="room-attendance-card" onClick={() => navigate(`/attendance/room/${room.id}`)}>
            <div className="room-attendance-card-header">
              <MdMeetingRoom size={24} />
              <div>
                <h3>{room.roomName}</h3>
                {room.location && <p>{room.location}</p>}
              </div>
            </div>
            <div className="room-attendance-card-footer">
              <span className={`room-status-badge ${room.status || "active"}`}>{room.status || "active"}</span>
              <span className="room-view-link">View Attendance →</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
