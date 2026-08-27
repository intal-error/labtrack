import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatDuration, formatTime, getTodayString } from "../utils/attendanceHelpers";
import { MdEventNote, MdSearch, MdToday, MdFileDownload } from "react-icons/md";
import "../styles/pages/attendance.css";

export default function MyAttendancePage() {
  const { userProfile } = useAuth();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalSessions: 0, totalTimeIn: 0, totalMinutes: 0, totalHours: 0 });
  const [loading, setLoading] = useState(true);

  const [filterSubject, setFilterSubject] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const schoolId = userProfile?.schoolId || userProfile?.schoolID;

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAttendance();
  }, [schoolId]);

  async function loadAttendance() {
    setLoading(true);
    try {
      const data = await api.getStudentAttendance(schoolId);
      setRecords(data.records || []);
      setSummary((prev) => ({ ...prev, ...(data.summary || {}) }));
    } catch {
    } finally {
      setLoading(false);
    }
  }

  const todayStr = getTodayString();
  const todayRecords = useMemo(() => records.filter((r) => r.date === todayStr), [records, todayStr]);

  const subjects = useMemo(() => {
    const set = new Set(records.map((r) => r.subject).filter(Boolean));
    return [...set].sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (filterSubject) result = result.filter((r) => r.subject === filterSubject);
    if (filterDate) result = result.filter((r) => r.date === filterDate);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        (r.subject || "").toLowerCase().includes(q) ||
        (r.professor || "").toLowerCase().includes(q) ||
        (r.labRoom || "").toLowerCase().includes(q) ||
        (r.date || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, filterSubject, filterDate, searchQuery]);

  const grouped = {};
  records.forEach((r) => {
    const d = r.date || "Unknown";
    const month = d.substring(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(r);
  });

  const monthlyData = Object.entries(grouped).map(([month, recs]) => ({
    month,
    sessions: recs.length,
    totalMinutes: recs.reduce((sum, r) => sum + (r.totalDuration || 0), 0),
  })).slice(0, 6);

  const recentRecords = useMemo(() => records.slice(0, 3), [records]);

  const exportCSV = () => {
    if (!filteredRecords.length) return;
    const headers = ["Date", "Time-In", "Time-Out", "Subject", "Professor", "Room", "Duration (min)", "Status"];
    const rows = filteredRecords.map((r) => [
      r.date, formatTime(r.timeIn), formatTime(r.timeOut), r.subject, r.professor, r.labRoom,
      r.totalDuration != null ? r.totalDuration : "", r.status === "active" ? "Inside" : "Timed Out",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <h1>My Attendance</h1>
        <p className="attendance-subtitle">Your laboratory attendance history</p>
      </div>

      <div className="attendance-shell">

        {/* Today's Status */}
        <div className="today-status-card">
          <div className="today-status-header">
            <MdToday size={18} />
            <h3>Today's Status</h3>
          </div>
          {todayRecords.length === 0 ? (
            <p className="today-no-record">No attendance recorded today</p>
          ) : (
            <div className="today-records-list">
              {todayRecords.map((r, i) => (
                <div key={r.id || i} className="today-record-item">
                  <div className="today-record-main">
                    <span className="today-record-subject">{r.subject || "N/A"}</span>
                    <span className="today-record-room">{r.labRoom || "Lab"}</span>
                  </div>
                  <div className="today-record-times">
                    <span>In: {formatTime(r.timeIn)}</span>
                    {r.timeOut && <span>Out: {formatTime(r.timeOut)}</span>}
                    {r.totalDuration != null && (
                      <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="attendance-stats">
          <div className="attendance-stat">
            <div className="attendance-stat-icon green">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="attendance-stat-info">
              <span className="attendance-stat-value">{summary.totalSessions}</span>
              <span className="attendance-stat-label">Total Sessions</span>
            </div>
          </div>
          <div className="attendance-stat">
            <div className="attendance-stat-icon blue">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="attendance-stat-info">
              <span className="attendance-stat-value">{summary.totalHours}h</span>
              <span className="attendance-stat-label">Total Lab Hours</span>
            </div>
          </div>
          <div className="attendance-stat">
            <div className="attendance-stat-icon orange">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <div className="attendance-stat-info">
              <span className="attendance-stat-value">{summary.totalTimeIn}</span>
              <span className="attendance-stat-label">Currently Active</span>
            </div>
          </div>
          <div className="attendance-stat">
            <div className="attendance-stat-icon purple">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="attendance-stat-info">
              <span className="attendance-stat-value">
                {(() => {
                  const completed = records.filter((r) => r.status === "timed_out").length;
                  const total = records.length;
                  return total > 0 ? Math.round((completed / total) * 100) : 0;
                })()}%
              </span>
              <span className="attendance-stat-label">Completion Rate</span>
            </div>
          </div>
        </div>

        {/* Recent Records */}
        {recentRecords.length > 0 && (
          <div className="recent-records-section">
            <h3 className="attendance-section-heading">Recent Activity</h3>
            <div className="recent-records-grid">
              {recentRecords.map((r, i) => (
                <div key={r.id || i} className="recent-record-card">
                  <div className="recent-record-date">{r.date}</div>
                  <div className="recent-record-subject">{r.subject || "N/A"}</div>
                  <div className="recent-record-meta">
                    <span>{r.labRoom || "Lab"}</span>
                    <span>{formatTime(r.timeIn)}{r.timeOut ? ` - ${formatTime(r.timeOut)}` : ""}</span>
                  </div>
                  <div className="recent-record-footer">
                    {r.totalDuration != null ? (
                      <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                    ) : (
                      <span className={`status-badge ${r.status}`}>{r.status === "active" ? "Inside" : "Timed Out"}</span>
                    )}
                    <span className="recent-record-professor">{r.professor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Breakdown */}
        {monthlyData.length > 0 && (
          <div className="monthly-summary-section">
            <h3>Monthly Summary</h3>
            <div className="monthly-summary-grid">
              {monthlyData.map((m) => (
                <div key={m.month} className="monthly-summary-card">
                  <div className="month-label">
                    {new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </div>
                  <div className="session-count">
                    {m.sessions} session{m.sessions !== 1 ? "s" : ""}
                  </div>
                  <div className="duration-value">
                    {formatDuration(m.totalMinutes)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance History */}
        <div className="attendance-toolbar">
          <div className="attendance-toolbar-left">
            <h3 className="attendance-section-heading" style={{ margin: 0 }}>Attendance History</h3>
            <span className="attendance-result-count">{filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="attendance-toolbar-right">
            <div className="attendance-search">
              <MdSearch size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {subjects.length > 0 && (
              <select
                className="attendance-filter-select"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <input
              type="date"
              className="attendance-date-filter"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            <button className="scan-attendance-btn" onClick={exportCSV} style={{ padding: "8px 14px", fontSize: 12 }}>
              <MdFileDownload size={16} /> Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="attendance-loading"><div className="spinner-lg" /></div>
        ) : records.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">
              <MdEventNote size={28} />
            </div>
            <h3>No Records Yet</h3>
            <p>Your attendance records will appear here after you scan your QR code in the laboratory</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">
              <MdSearch size={28} />
            </div>
            <h3>No Matching Records</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <>
            <div className="attendance-table-wrap desktop-only">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time-In</th>
                      <th>Time-Out</th>
                      <th>Subject</th>
                      <th>Professor</th>
                      <th>Room</th>
                      <th>Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r, i) => (
                      <tr key={r.id || i}>
                        <td style={{ fontWeight: 600 }}>{r.date}</td>
                        <td>{formatTime(r.timeIn)}</td>
                        <td>{formatTime(r.timeOut)}</td>
                        <td>{r.subject}</td>
                        <td>{r.professor}</td>
                        <td>{r.labRoom}</td>
                        <td>
                          {r.totalDuration != null ? (
                            <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                          ) : "-"}
                        </td>
                        <td>
                          <span className={`status-badge ${r.status}`}>
                            {r.status === "active" ? "Inside" : "Timed Out"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mobile-cards mobile-only">
              {filteredRecords.map((r, i) => (
                <div key={r.id || i} className="mobile-record-card">
                  <div className="mobile-record-header">
                    <span className="mobile-record-date">{r.date}</span>
                    <span className={`status-badge ${r.status}`}>
                      {r.status === "active" ? "Inside" : "Timed Out"}
                    </span>
                  </div>
                  <div className="mobile-record-body">
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Subject</span>
                      <span className="mobile-record-value">{r.subject || "N/A"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Professor</span>
                      <span className="mobile-record-value">{r.professor || "N/A"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Room</span>
                      <span className="mobile-record-value">{r.labRoom || "N/A"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Time</span>
                      <span className="mobile-record-value">{formatTime(r.timeIn)}{r.timeOut ? ` - ${formatTime(r.timeOut)}` : ""}</span>
                    </div>
                  </div>
                  {r.totalDuration != null && (
                    <div className="mobile-record-footer">
                      <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
