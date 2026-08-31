import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { formatDuration, formatTime, getTodayString } from "../utils/attendanceHelpers";
import RoomManagementTab from "../components/tabs/RoomManagementTab";
import toast from "react-hot-toast";
import "../styles/pages/attendance.css";

import {
  MdPeople,
  MdEventNote,
  MdQrCodeScanner,
  MdRefresh,
  MdFileDownload,
  MdEdit,
  MdDelete,
  MdAccessTime,
  MdGroup,
  MdMeetingRoom,
  MdEventAvailable,
} from "react-icons/md";
import PageHero from "../components/ui/PageHero";

const TABS = [
  { key: "active", label: "Currently Inside", icon: MdPeople },
  { key: "today", label: "Today's Log", icon: MdEventNote },
  { key: "roomLogs", label: "Room Logs", icon: MdMeetingRoom },
  { key: "rooms", label: "Room QR Codes", icon: MdQrCodeScanner },
];

export default function AttendanceLogsPage() {
  const [activeTab, setActiveTab] = useState("active");
  const [stats, setStats] = useState(null);
  const [activeStudents, setActiveStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Room filter for Currently Inside
  const [rooms, setRooms] = useState([]);
  const [filterRoom, setFilterRoom] = useState("");
  const filterRoomRef = useRef("");
  filterRoomRef.current = filterRoom;

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
      const params = new URLSearchParams();
      if (filterRoomRef.current) params.set("room", filterRoomRef.current);
      const data = await api.getActiveStudents(params.toString());
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

  const loadRooms = useCallback(async () => {
    try {
      const data = await api.getRooms();
      setRooms(data);
    } catch (err) {
      console.error("Failed to load rooms:", err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadActive();
    loadToday();
    loadRooms();
  }, [loadStats, loadActive, loadToday]);

  // Refetch rooms when switching to active tab (picks up newly created rooms)
  useEffect(() => {
    if (activeTab === "active") loadRooms();
  }, [activeTab]);

  // Auto-refresh active every 30s
  useEffect(() => {
    if (activeTab !== "active") return;
    const interval = setInterval(loadActive, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadActive]);

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
      loadStats();
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  }

  return (
    <div className="attendance-page">
      {/* Hero Header */}
      <PageHero icon={MdEventAvailable} title="Attendance Logs" subtitle="Monitor student laboratory attendance in real-time" />

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
                <MdAccessTime size={20} />
              </div>
              <div className="attendance-stat-info">
                <span className="attendance-stat-value">{formatDuration(stats.totalMinutesToday)}</span>
                <span className="attendance-stat-label">Total Hours Today</span>
              </div>
            </div>
            <div className="attendance-stat">
              <div className="attendance-stat-icon purple">
                <MdGroup size={20} />
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
                {rooms.length > 0 && (
                  <select
                    className="attendance-filter-select"
                    value={filterRoom}
                    onChange={(e) => setFilterRoom(e.target.value)}
                  >
                    <option value="">All Rooms</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.roomCode}>{r.roomName}</option>
                    ))}
                  </select>
                )}
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
                        <td className="cell-name">{r.firstName} {r.lastName}</td>
                        <td>{r.studentSchoolId}</td>
                        <td>{r.course}</td>
                        <td>{r.year}</td>
                        <td className="cell-muted">{r.subject}</td>
                        <td className="cell-muted">{r.professor}</td>
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

        {/* Room Logs Tab */}
        {activeTab === "roomLogs" && <RoomAttendanceView />}

        {/* Room Management Tab */}
        {activeTab === "rooms" && <RoomManagementTab />}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="attendance-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="attendance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Attendance Record</h2>
            <p className="edit-modal-subtitle">
              {editModal.firstName} {editModal.lastName} &mdash; {editModal.date}
            </p>
            <div className="attendance-edit-form">
              <label>Subject</label>
              <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="e.g. Computer Programming 1" />
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
