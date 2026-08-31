import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatDuration, formatTime, getTodayString } from "../utils/attendanceHelpers";
import { MdSearch, MdFileDownload, MdQrCodeScanner, MdMenuBook, MdEventAvailable } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import "../styles/pages/attendance.css";

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeAgo(date) {
  const d = toDate(date);
  if (!d) return "";
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MyAttendancePage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
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
    } catch {
    } finally {
      setLoading(false);
    }
  }

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

  const todayStr = getTodayString();

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
    a.download = `my-logs-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="attendance-page">
      <PageHero icon={MdEventAvailable} title="My Logs" subtitle="Your laboratory sign-in history">
        <button className="hero-action-btn ghost" onClick={() => navigate("/attendance-scan")}>
          <MdQrCodeScanner size={16} /> Scan Attendance
        </button>
      </PageHero>

      <div className="attendance-shell">
        {/* Quick Scan */}
        <button className="logbook-quick-scan" onClick={() => navigate("/attendance-scan")}>
          <MdQrCodeScanner size={18} />
          Scan Attendance
        </button>

        {/* Toolbar */}
        <div className="attendance-toolbar">
          <div className="attendance-toolbar-left">
            <div className="attendance-search">
              <MdSearch size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search room, subject, professor..."
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
            {(searchQuery || filterSubject || filterDate) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearchQuery(""); setFilterSubject(""); setFilterDate(""); }}>
                Clear
              </button>
            )}
          </div>
          <div className="attendance-toolbar-right">
            <span className="attendance-result-count">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}
            </span>
            <button className="scan-attendance-btn" onClick={exportCSV} style={{ padding: "8px 14px", fontSize: 12 }}>
              <MdFileDownload size={16} /> Export
            </button>
          </div>
        </div>

        {/* Logbook Table */}
        {loading ? (
          <div className="attendance-loading"><div className="spinner-lg" /></div>
        ) : records.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">
              <MdMenuBook size={28} />
            </div>
            <h3>No Logs Yet</h3>
            <p>Scan a room QR code to start logging your attendance</p>
            <button className="scan-attendance-btn" onClick={() => navigate("/attendance-scan")} style={{ marginTop: 8 }}>
              <MdQrCodeScanner size={16} /> Scan Attendance
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">
              <MdSearch size={28} />
            </div>
            <h3>No Matching Records</h3>
            <p>Try adjusting your search or filter</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="attendance-table-wrap desktop-only">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Room</th>
                      <th>Subject</th>
                      <th>Professor</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                      <th>Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r, i) => (
                      <tr key={r.id || i} className={r.date === todayStr ? "today-row" : ""}>
                        <td style={{ fontWeight: 600 }}>{r.date}</td>
                        <td>{r.labRoom || "—"}</td>
                        <td>{r.subject || "—"}</td>
                        <td>{r.professor || "—"}</td>
                        <td>{formatTime(r.timeIn)}</td>
                        <td>{formatTime(r.timeOut) || "—"}</td>
                        <td>
                          {r.totalDuration != null ? (
                            <span className="duration-badge">{formatDuration(r.totalDuration)}</span>
                          ) : "—"}
                        </td>
                        <td>
                          <span className={`status-badge ${r.status}`}>
                            {r.status === "active" ? "Inside" : "Signed Out"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-cards mobile-only">
              {filteredRecords.map((r, i) => (
                <div key={r.id || i} className="mobile-record-card">
                  <div className="mobile-record-header">
                    <span className="mobile-record-date">{r.date}</span>
                    <span className={`status-badge ${r.status}`}>
                      {r.status === "active" ? "Inside" : "Signed Out"}
                    </span>
                  </div>
                  <div className="mobile-record-body">
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Room</span>
                      <span className="mobile-record-value">{r.labRoom || "—"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Subject</span>
                      <span className="mobile-record-value">{r.subject || "—"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Professor</span>
                      <span className="mobile-record-value">{r.professor || "—"}</span>
                    </div>
                    <div className="mobile-record-row">
                      <span className="mobile-record-label">Time</span>
                      <span className="mobile-record-value">
                        {formatTime(r.timeIn)}{r.timeOut ? ` - ${formatTime(r.timeOut)}` : ""}
                      </span>
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
