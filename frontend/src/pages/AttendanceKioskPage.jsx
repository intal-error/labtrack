import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "../services/api";
import { SUBJECTS } from "../constants/subjects";
import { formatDuration } from "../utils/attendanceHelpers";
import "../styles/pages/attendance-kiosk.css";

const STEPS = {
  SCAN_STUDENT: "scan_student",
  CONFIRM_INFO: "confirm_info",
  SUCCESS: "success",
  ERROR: "error",
};

export default function AttendanceKioskPage() {
  const [searchParams] = useSearchParams();
  const roomName = searchParams.get("room") || "Laboratory";

  const [step, setStep] = useState(STEPS.SCAN_STUDENT);
  const [studentData, setStudentData] = useState(null);
  const [subject, setSubject] = useState("");
  const [professor, setProfessor] = useState("");
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [scanType, setScanType] = useState(null);

  const scannerRef = useRef(null);
  const runningRef = useRef(false);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    runningRef.current = false;
    if (s) {
      try { await s.stop(); } catch {}
      try { await s.clear(); } catch {}
    }
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const startScanner = useCallback(async () => {
    await stopScanner();
    try {
      const scanner = new Html5Qrcode("kiosk-qr-reader");
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
        const scanner = new Html5Qrcode("kiosk-qr-reader");
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
        setErrorMessage("Camera unavailable. Please try again.");
        setStep(STEPS.ERROR);
      }
    }
  }, [stopScanner]);

  useEffect(() => {
    if (step === STEPS.SCAN_STUDENT) {
      setStudentData(null);
      setSubject("");
      setProfessor("");
      setScanType(null);
      setTimeout(() => startScanner(), 100);
    }
  }, [step, startScanner]);

  const handleScan = async (decodedText) => {
    const text = decodedText.trim();

    // Check if it's a student QR code
    if (text.startsWith("SLSU-STUDENT:")) {
      const schoolId = text.replace("SLSU-STUDENT:", "").trim();
      setScanType("student");
      try {
        const data = await api.lookupStudent(schoolId);
        setStudentData(data);
        setStep(STEPS.CONFIRM_INFO);
      } catch (err) {
        setErrorMessage(err.message || "Student not found");
        setStep(STEPS.ERROR);
      }
      return;
    }

    // Check if it's a room QR code
    if (text.startsWith("LABROOM:")) {
      // Already on the correct room page, just restart scanner
      setTimeout(() => startScanner(), 100);
      return;
    }

    // Try as raw school ID
    setScanType("student");
    try {
      const data = await api.lookupStudent(text);
      setStudentData(data);
      setStep(STEPS.CONFIRM_INFO);
    } catch (err) {
      setErrorMessage(err.message || "Student not found. Please scan a valid student QR code.");
      setStep(STEPS.ERROR);
    }
  };

  const handleTimeIn = async () => {
    if (!studentData || !subject || !professor) return;
    setSubmitting(true);
    try {
      const result = await api.timeIn({
        schoolId: studentData.schoolId,
        subject,
        professor,
        labRoom: roomName,
        roomCode: roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      });
      setResultData(result.record);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      setErrorMessage(err.message || "Failed to record time-in");
      setStep(STEPS.ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTimeOut = async () => {
    setSubmitting(true);
    try {
      const result = await api.timeOut({
        schoolId: studentData.schoolId,
      });
      setResultData(result.record);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      setErrorMessage(err.message || "Failed to record time-out");
      setStep(STEPS.ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const resetToScan = () => {
    setStep(STEPS.SCAN_STUDENT);
    setStudentData(null);
    setResultData(null);
    setErrorMessage("");
    setSubject("");
    setProfessor("");
    setScanType(null);
  };

  const clockStr = clock.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dateStr = clock.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="kiosk-page">
      <div className="kiosk-header">
        <div className="kiosk-logo">
          <img src="/slsulucena.jpg" alt="SLSU" />
          <span className="kiosk-logo-text">LabTrack</span>
        </div>
        <div className="kiosk-room-badge">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span>{roomName}</span>
        </div>
        <div className="kiosk-clock">
          <div>{clockStr}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{dateStr}</div>
        </div>
      </div>

      <div className="kiosk-body">
        {step === STEPS.SCAN_STUDENT && (
          <div className="kiosk-scan-prompt kiosk-step-enter" key="scan">
            <h2>Scan Your QR Code</h2>
            <p>Position your student QR code in front of the camera</p>
            <div className="kiosk-scanner-area">
              <div className="kiosk-scanner-corners" />
              <div id="kiosk-qr-reader" />
            </div>
          </div>
        )}

        {step === STEPS.CONFIRM_INFO && studentData && (
          <div className="kiosk-student-card kiosk-step-enter" key="confirm">
            <div className="kiosk-student-header">
              <div className="kiosk-student-avatar">
                {(studentData.firstName || "?")[0]}{(studentData.lastName || "?")[0]}
              </div>
              <div className="kiosk-student-info">
                <p className="kiosk-student-name">
                  {studentData.firstName} {studentData.lastName}
                </p>
                <p className="kiosk-student-id">ID: {studentData.schoolId}</p>
              </div>
            </div>

            <div className="kiosk-form-grid">
              <div className="kiosk-form-row">
                <label>Course</label>
                <input type="text" value={studentData.course || ""} readOnly />
              </div>
              <div className="kiosk-form-row">
                <label>Year Level</label>
                <input type="text" value={studentData.year || ""} readOnly />
              </div>
            </div>

            <div className="kiosk-form-row">
              <label>Subject *</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Select Subject</option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="kiosk-form-row">
              <label>Professor / Instructor *</label>
              <input
                type="text"
                placeholder="Enter professor name"
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
              />
            </div>

            <button
              className="kiosk-confirm-btn time-in"
              onClick={handleTimeIn}
              disabled={!subject || !professor || submitting}
            >
              {submitting ? (
                <span className="spinner" />
              ) : (
                <>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  CONFIRM TIME-IN
                </>
              )}
            </button>
            <button className="kiosk-cancel-btn" onClick={resetToScan}>
              Cancel / Scan Again
            </button>
          </div>
        )}

        {step === STEPS.SUCCESS && resultData && (
          <div className="kiosk-status inside kiosk-step-enter" key="success">
            <div className="kiosk-status-icon success">
              {resultData.status === "active" ? (
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" />
                </svg>
              )}
            </div>
            <h2 className="kiosk-status-title">
              {resultData.status === "active" ? "Time-In Recorded!" : "Time-Out Recorded!"}
            </h2>
            <p className="kiosk-status-subtitle">
              {resultData.firstName} {resultData.lastName}
            </p>
            <div className="kiosk-success-detail">
              <div className="kiosk-success-row">
                <span className="kiosk-success-label">Student ID</span>
                <span className="kiosk-success-value">{resultData.studentSchoolId}</span>
              </div>
              <div className="kiosk-success-row">
                <span className="kiosk-success-label">Room</span>
                <span className="kiosk-success-value">{resultData.labRoom}</span>
              </div>
              {resultData.status === "active" && (
                <div className="kiosk-success-row">
                  <span className="kiosk-success-label">Time-In</span>
                  <span className="kiosk-success-value">
                    {resultData.timeIn
                      ? new Date(resultData.timeIn.seconds ? resultData.timeIn.seconds * 1000 : resultData.timeIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
                      : "-"}
                  </span>
                </div>
              )}
              {resultData.status === "timed_out" && resultData.totalDuration != null && (
                <div className="kiosk-success-row">
                  <span className="kiosk-success-label">Total Duration</span>
                  <span className="kiosk-success-value">{formatDuration(resultData.totalDuration)}</span>
                </div>
              )}
            </div>
            <button className="kiosk-reset-btn" onClick={resetToScan}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Next Student
            </button>
          </div>
        )}

        {step === STEPS.ERROR && (
          <div className="kiosk-status error kiosk-step-enter" key="error">
            <div className="kiosk-status-icon error-icon">
              <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="kiosk-status-title">Error</h2>
            <p className="kiosk-status-subtitle">{errorMessage}</p>
            <button className="kiosk-reset-btn" onClick={resetToScan}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          </div>
        )}
      </div>

      <div className="kiosk-footer">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4, opacity: .6 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        SLSU LabTrack v4 &mdash; Laboratory Attendance System
      </div>
    </div>
  );
}
