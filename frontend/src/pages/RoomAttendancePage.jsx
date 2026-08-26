import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { formatDuration, formatTime } from "../utils/attendanceHelpers";
import { MdArrowBack, MdSearch, MdFileDownload, MdMeetingRoom } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/attendance.css";

export default function RoomAttendancePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (search) params.set("student", search);
      params.set("page", page);
      params.set("limit", "50");
      const data = await api.getRoomAttendanceHistory(roomId, params.toString());
      setRecords(data.records || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.roomName) setRoomName(data.roomName);
    } catch (err) {
      toast.error(err.message || "Failed to load room attendance");
    } finally {
      setLoading(false);
    }
  }, [roomId, dateFrom, dateTo, search, page]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function handleExport() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (search) params.set("student", search);
    api.exportAttendance(params.toString()).catch(() => toast.error("Export failed"));
  }

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <div className="room-attendance-header-row">
          <button className="admin-back-btn" onClick={() => navigate("/attendance")}>
            <MdArrowBack size={20} />
          </button>
          <div>
            <h1><MdMeetingRoom size={24} /> {roomName || "Room Attendance"}</h1>
            <p className="attendance-subtitle">Attendance records for this laboratory room</p>
          </div>
        </div>
      </div>

      <div className="attendance-shell">
        <div className="attendance-toolbar">
          <div className="attendance-toolbar-left">
            <div className="attendance-search">
              <MdSearch className="search-icon" size={16} />
              <input
                type="text"
                placeholder="Search student name or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
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
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="attendance-date-filter">
              <label>To:</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            {(search || dateFrom || dateTo) && (
              <button className="btn btn-secondary" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
                Clear Filters
              </button>
            )}
          </div>
          <div className="attendance-toolbar-left">
            <span className="attendance-result-count">
              {total} record{total !== 1 ? "s" : ""} found
            </span>
          </div>
        </div>

        {loading ? (
          <div className="attendance-empty">
            <div className="spinner-lg" />
            <h3>Loading records...</h3>
          </div>
        ) : records.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon"><MdMeetingRoom size={28} /></div>
            <h3>No Records Found</h3>
            <p>No students have logged attendance for this room yet</p>
          </div>
        ) : (
          <>
            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Student ID</th>
                    <th>Course/Section</th>
                    <th>Year</th>
                    <th>Subject</th>
                    <th>Professor</th>
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td style={{ textAlign: "left", fontWeight: 600 }}>{r.firstName} {r.lastName}</td>
                      <td>{r.studentSchoolId}</td>
                      <td>{r.course}</td>
                      <td>{r.year}</td>
                      <td style={{ textAlign: "left" }}>{r.subject}</td>
                      <td style={{ textAlign: "left" }}>{r.professor}</td>
                      <td>{r.date}</td>
                      <td>{formatTime(r.timeIn)}</td>
                      <td>{formatTime(r.timeOut)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="attendance-pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span className="page-info">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
