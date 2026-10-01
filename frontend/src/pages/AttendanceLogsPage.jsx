import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { formatDuration, formatTime } from "../utils/attendanceHelpers";
import ExportReportModal from "../components/ui/ExportReportModal";
import { buildAttendanceQuery } from "../components/ui/exportReport";
import RoomManagementTab from "../components/tabs/RoomManagementTab";
import StatStrip from "../components/ui/StatStrip";
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
} from "react-icons/md";

const TABS = [
  { key: "active", label: "Currently Inside", icon: MdPeople },
  { key: "today", label: "Today's Log", icon: MdEventNote },
  { key: "roomLogs", label: "Room Logs", icon: MdMeetingRoom },
  { key: "rooms", label: "Room QR Codes", icon: MdQrCodeScanner },
];

export default function AttendanceLogsPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "active");
  const [stats, setStats] = useState(null);
  const [activeStudents, setActiveStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  // Room filter for Currently Inside
  const [rooms, setRooms] = useState([]);
  const [filterRoom, setFilterRoom] = useState("");
  const filterRoomRef = useRef("");
  useEffect(() => { filterRoomRef.current = filterRoom; }, [filterRoom]);

  // Edit modal
  const [editModal, setEditModal] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editProfessor, setEditProfessor] = useState("");

  // Report export
  const [facets, setFacets] = useState({ courses: [], years: [], sections: [] });
  const [filterCourse, setFilterCourse] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // Full-table scan -- only pay for it when the Today tab actually shows filters.
    if (activeTab !== "today") return;
    let cancelled = false;
    api.getAttendanceFacets()
      .then((data) => { if (!cancelled && data) setFacets(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab]);

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
      const params = new URLSearchParams();
      if (filterCourse) params.set("course", filterCourse);
      if (filterYear) params.set("year", filterYear);
      if (filterSection) params.set("section", filterSection);
      const data = await api.getTodayAttendance(params.toString());
      setTodayRecords(data);
    } catch (err) {
      console.error("Failed to load today records:", err);
    }
  }, [filterCourse, filterYear, filterSection]);

  useEffect(() => {
    api.getAttendanceStats()
      .then(setStats)
      .catch((err) => console.error("Failed to load stats:", err));
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filterRoomRef.current) params.set("room", filterRoomRef.current);
        const data = await api.getActiveStudents(params.toString());
        setActiveStudents(data);
      } catch (err) {
        console.error("Failed to load active students:", err);
      }
    })();
    api.getRooms()
      .then(setRooms)
      .catch((err) => console.error("Failed to load rooms:", err));
  }, []);

  // Loads today on mount and again whenever a today-tab filter changes.
  // Deferred so rapid filter changes settle before hitting the API.
  useEffect(() => {
    const timer = setTimeout(loadToday, 0);
    return () => clearTimeout(timer);
  }, [loadToday]);

  // Refetch rooms when switching to active tab (picks up newly created rooms)
  useEffect(() => {
    if (activeTab !== "active") return;
    api.getRooms()
      .then(setRooms)
      .catch((err) => console.error("Failed to load rooms:", err));
  }, [activeTab]);

  // Auto-refresh active every 30s
  useEffect(() => {
    if (activeTab !== "active") return;
    const interval = setInterval(loadActive, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadActive]);

  async function handleExport(draft) {
    setExporting(true);
    try {
      const query = buildAttendanceQuery({ ...draft, dateRange: draft.dateRange || "today" });
      const qs = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      await api.exportAttendance(qs);
      setExportOpen(false);
      toast.success("Report downloaded!");
    } catch (err) {
      toast.error(err.message || "Download failed");
    } finally {
      setExporting(false);
    }
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
      <div className="attendance-shell">
        {/* Stats */}
        {stats && (
          <StatStrip
            items={[
              { label: "Currently Inside", value: stats.currentlyInside, icon: <MdPeople size={20} /> },
              { label: "Today's Sessions", value: stats.totalToday, icon: <MdEventNote size={20} /> },
              { label: "Total Hours Today", value: formatDuration(stats.totalMinutesToday), icon: <MdAccessTime size={20} /> },
              { label: "Students This Week", value: stats.uniqueStudentsThisWeek, icon: <MdGroup size={20} /> },
            ]}
          />
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
                {facets.courses.length > 0 && (
                  <select
                    className="attendance-filter-select"
                    value={filterCourse}
                    onChange={(e) => setFilterCourse(e.target.value)}
                  >
                    <option value="">All Courses</option>
                    {facets.courses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {facets.years.length > 0 && (
                  <select
                    className="attendance-filter-select"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                  >
                    <option value="">All Years</option>
                    {facets.years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}
                {facets.sections.length > 0 && (
                  <select
                    className="attendance-filter-select"
                    value={filterSection}
                    onChange={(e) => setFilterSection(e.target.value)}
                  >
                    <option value="">All Sections</option>
                    {facets.sections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {(filterCourse || filterYear || filterSection) && (
                  <button className="btn btn-secondary" onClick={() => { setFilterCourse(""); setFilterYear(""); setFilterSection(""); }}>
                    Clear Filters
                  </button>
                )}
                <span className="attendance-result-count">
                  {todayRecords.length} record{todayRecords.length !== 1 ? "s" : ""} today
                </span>
              </div>
              <div className="attendance-toolbar-right">
                <button className="btn btn-primary" onClick={() => setExportOpen(true)}>
                  <MdFileDownload size={14} /> Download Report
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
                      <th>Section</th>
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
                        <td>{r.section || "—"}</td>
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
                            {r.status === "active" ? "Signed In" : "Signed Out"}
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

      <ExportReportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialFilters={{
          course: filterCourse || "All",
          year: filterYear || "All",
          section: filterSection || "All",
          dateRange: "today",
        }}
        onExport={handleExport}
        exporting={exporting}
        options={{
          typeTabs: [],
          showSection: true,
          sectionOptions: facets.sections,
          courseOptions: facets.courses.length ? facets.courses : undefined,
          yearOptions: facets.years.length ? facets.years : undefined,
        }}
      />
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
        <p>Add laboratory rooms in the &quot;Room QR Codes&quot; tab first</p>
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
