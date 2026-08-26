import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatDuration, formatTime } from "../utils/attendanceHelpers";
import { SUBJECTS } from "../constants/subjects";
import { MdQrCodeScanner, MdCheckCircle, MdLogin, MdLogout } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/attendance.css";

const emptyForm = { firstName: "", lastName: "", schoolId: "", course: "", yearSection: "", subject: "", professor: "" };

export default function MyAttendancePage() {
  const { userProfile } = useAuth();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalSessions: 0, totalTimeIn: 0, totalMinutes: 0, totalHours: 0 });
  const [loading, setLoading] = useState(true);

  // Scanner state
  const [scannerActive, setScannerActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Form state
  const [needForm, setNeedForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [roomCode, setRoomCode] = useState("");
  const [labRoom, setLabRoom] = useState("");
  const [lastSchoolId, setLastSchoolId] = useState("");

  const scannerRef = useRef(null);
  const runningRef = useRef(false);

  const schoolId = userProfile?.schoolId || userProfile?.schoolID;

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    loadAttendance();
  }, [schoolId]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  async function loadAttendance() {
    setLoading(true);
    try {
      const data = await api.getStudentAttendance(schoolId);
      setRecords(data.records || []);
      setSummary(data.summary || {});
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    runningRef.current = false;
    if (s) {
      try { await s.stop(); } catch {}
      try { await s.clear(); } catch {}
    }
  }, []);

  const startScanner = useCallback(async () => {
    await stopScanner();
    try {
      const scanner = new Html5Qrcode("my-attendance-qr");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        async (decodedText) => {
          if (!runningRef.current) return;
          runningRef.current = false;
          await stopScanner();
          handleScan(decodedText);
        },
        () => {}
      );
      runningRef.current = true;
    } catch {
      try {
        await stopScanner();
        const scanner = new Html5Qrcode("my-attendance-qr");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "user" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (!runningRef.current) return;
            runningRef.current = false;
            await stopScanner();
            handleScan(decodedText);
          },
          () => {}
        );
        runningRef.current = true;
      } catch {
        toast.error("Camera unavailable. Please try again.");
        setScannerActive(false);
      }
    }
  }, [stopScanner]);

  useEffect(() => {
    if (scannerActive) {
      setTimeout(() => startScanner(), 100);
    }
  }, [scannerActive, startScanner]);

  const handleScan = async (decodedText) => {
    const text = decodedText.trim();
    setScannerActive(false);

    // Parse room QR code
    let parsedRoom = "";
    let parsedCode = "";
    if (text.startsWith("LABROOM:")) {
      parsedCode = text.split(":")[1] || "";
      parsedRoom = parsedCode.replace(/-/g, " ").trim();
    } else if (text.includes("lab") || text.includes("room") || text.includes("computer")) {
      parsedRoom = text;
      parsedCode = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    } else {
      toast.error("Please scan a room QR code");
      return;
    }

    setRoomCode(parsedCode);
    setLabRoom(parsedRoom);

    // If we have a lastSchoolId from previous time-in, try time-out
    if (lastSchoolId) {
      setScanLoading(true);
      try {
        const result = await api.autoScan({ schoolId: lastSchoolId, roomCode: parsedCode, labRoom: parsedRoom });
        setScanResult(result);
        if (result.type === "time_out") {
          toast.success("Timed out successfully!");
          setLastSchoolId("");
          loadAttendance();
        } else if (result.type === "need_form") {
          // Shouldn't happen since we sent schoolId, but fallback to form
          setNeedForm(true);
        }
      } catch (err) {
        // If error (e.g., no active session), show form for new time-in
        setNeedForm(true);
      } finally {
        setScanLoading(false);
      }
      return;
    }

    // No lastSchoolId — first scan, show form
    setNeedForm(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.schoolId || !form.course || !form.yearSection || !form.subject || !form.professor) {
      toast.error("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.autoScan({
        schoolId: form.schoolId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        course: form.course.trim(),
        year: form.yearSection.trim(),
        subject: form.subject,
        professor: form.professor.trim(),
        roomCode,
        labRoom,
      });
      setScanResult(result);
      setLastSchoolId(form.schoolId.trim());
      setNeedForm(false);
      setForm(emptyForm);
      toast.success("Timed in successfully!");
      loadAttendance();
    } catch (err) {
      toast.error(err.message || "Failed to record attendance");
      setScanResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openScanner = () => {
    setScanResult(null);
    setNeedForm(false);
    setScannerActive(true);
  };

  const closeScanner = () => {
    stopScanner();
    setScannerActive(false);
  };

  const closeForm = () => {
    setNeedForm(false);
    setForm(emptyForm);
    setRoomCode("");
    setLabRoom("");
  };

  // Group records by month
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

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <h1>My Attendance</h1>
        <p className="attendance-subtitle">Your laboratory attendance history</p>
      </div>

      <div className="attendance-shell">
        {/* Scan to Log Attendance */}
        <div className="scan-attendance-card">
          {!needForm && !scannerActive && (
            <div className="scan-attendance-top">
              <div className="scan-attendance-info">
                <h3><MdQrCodeScanner size={20} /> Scan to Log Attendance</h3>
                <p>Scan the room QR code to log your attendance</p>
              </div>
              <button className="scan-attendance-btn" onClick={openScanner}>
                <MdQrCodeScanner size={18} /> {lastSchoolId ? "Scan to Time Out" : "Scan Room QR"}
              </button>
            </div>
          )}

          {scannerActive && (
            <>
              <div className="scan-attendance-top" style={{ marginBottom: 12 }}>
                <div className="scan-attendance-info">
                  <h3><MdQrCodeScanner size={20} /> Scanning...</h3>
                  <p>Point camera at room QR code</p>
                </div>
                <button className="scan-attendance-btn cancel" onClick={closeScanner}>Cancel</button>
              </div>
              <div className="scan-viewfinder">
                <div className="scan-viewfinder-corners" />
                <div id="my-attendance-qr" />
              </div>
            </>
          )}

          {needForm && (
            <form onSubmit={handleFormSubmit} className="scan-form">
              <div className="scan-form-header">
                <h3>Log Attendance</h3>
                <p>Room: <strong>{labRoom}</strong></p>
              </div>
              <div className="scan-form-grid">
                <div className="scan-form-field">
                  <label>First Name</label>
                  <input type="text" placeholder="Juan" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                </div>
                <div className="scan-form-field">
                  <label>Last Name</label>
                  <input type="text" placeholder="Dela Cruz" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                </div>
                <div className="scan-form-field">
                  <label>Student ID</label>
                  <input type="text" placeholder="2024-00001" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} required />
                </div>
                <div className="scan-form-field">
                  <label>Course</label>
                  <input type="text" placeholder="BIT, CT, MT, etc." value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} required />
                </div>
                <div className="scan-form-field">
                  <label>Year / Section</label>
                  <input type="text" placeholder="3A, 2B, etc." value={form.yearSection} onChange={(e) => setForm({ ...form, yearSection: e.target.value })} required />
                </div>
                <div className="scan-form-field">
                  <label>Subject</label>
                  <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required>
                    <option value="">Select Subject</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="scan-form-field full-width">
                  <label>Professor</label>
                  <input type="text" placeholder="Enter professor name" value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} required />
                </div>
              </div>
              <div className="scan-form-actions">
                <button type="submit" className="scan-attendance-btn" disabled={submitting}>
                  {submitting ? "Recording..." : "Submit & Log Attendance"}
                </button>
                <button type="button" className="scan-attendance-btn cancel" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          )}

          {submitting && (
            <div className="scan-loading">
              <div className="spinner-lg" />
              <span>Recording attendance...</span>
            </div>
          )}

          {scanResult && !scanResult.error && !needForm && (
            <div className={`scan-result-card ${scanResult.type}`}>
              <div className={`scan-result-icon ${scanResult.type}`}>
                {scanResult.type === "time_in" ? <MdLogin size={28} /> : <MdLogout size={28} />}
              </div>
              <div className="scan-result-info">
                <h4>{scanResult.type === "time_in" ? "Time In Recorded" : "Time Out Recorded"}</h4>
                <p>
                  {scanResult.type === "time_in"
                    ? `Checked in at ${scanResult.record?.labRoom || "Lab"}`
                    : `Duration: ${scanResult.record?.totalDuration || 0} minutes`}
                </p>
              </div>
              <MdCheckCircle size={24} className="scan-result-check" />
            </div>
          )}

          {scanResult?.error && !needForm && (
            <div className="scan-result-card error">
              <div className="scan-result-icon error">✕</div>
              <div className="scan-result-info">
                <h4>Scan Failed</h4>
                <p>{scanResult.error}</p>
              </div>
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
        </div>

        {/* Monthly Breakdown */}
        {monthlyData.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>Monthly Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {monthlyData.map((m) => (
                <div key={m.month} style={{
                  padding: "14px 16px", background: "var(--bg)", borderRadius: 12,
                  border: "1px solid var(--border)", textAlign: "center"
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {m.sessions} session{m.sessions !== 1 ? "s" : ""}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--green)", marginTop: 4 }}>
                    {formatDuration(m.totalMinutes)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Records Table */}
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>Attendance History</h3>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}><div className="spinner-lg" /></div>
        ) : records.length === 0 ? (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">📋</div>
            <h3>No Records Yet</h3>
            <p>Your attendance records will appear here after you scan your QR code in the laboratory</p>
          </div>
        ) : (
          <div className="attendance-table-wrap">
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
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.date}</td>
                      <td>{formatTime(r.timeIn)}</td>
                      <td>{formatTime(r.timeOut)}</td>
                      <td style={{ textAlign: "left" }}>{r.subject}</td>
                      <td style={{ textAlign: "left" }}>{r.professor}</td>
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
        )}
      </div>
    </div>
  );
}
