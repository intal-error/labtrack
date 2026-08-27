import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatDuration } from "../utils/attendanceHelpers";

import ScannerCamera from "../components/scanner/ScannerCamera";
import toast from "react-hot-toast";
import {
  MdQrCodeScanner, MdLogin, MdLogout, MdCheckCircle, MdError,
} from "react-icons/md";
import "../styles/pages/attendance-scanner.css";

export default function AttendanceScannerPage() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId || userProfile?.schoolID;

  const [mode, setMode] = useState("time_in");
  const [roomCode, setRoomCode] = useState("");
  const [labRoom, setLabRoom] = useState("");
  const [roomResult, setRoomResult] = useState(null);
  const [subject, setSubject] = useState("");
  const [professor, setProfessor] = useState("");
  const [cameraTarget, setCameraTarget] = useState(null);
  const [txStatus, setTxStatus] = useState("");
  const [txStatusType, setTxStatusType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [step1Collapsed, setStep1Collapsed] = useState(false);
  const [step2Collapsed, setStep2Collapsed] = useState(false);

  const step2Ref = useRef(null);

  const isTimeIn = mode === "time_in";

  useEffect(() => {
    if (step1Collapsed && isTimeIn) {
      setTimeout(() => {
        step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, [step1Collapsed, isTimeIn]);

  const parseRoomQR = (text) => {
    const t = text.trim();
    if (t.startsWith("LABROOM:")) {
      const code = t.replace("LABROOM:", "").trim();
      return { code, name: code.replace(/-/g, " ").trim() };
    }
    if (t.includes("lab") || t.includes("room") || t.includes("computer")) {
      return { code: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: t };
    }
    return null;
  };

  const handleCameraScan = async (decodedText) => {
    setCameraTarget(null);
    const parsed = parseRoomQR(decodedText);
    if (!parsed) {
      setTxStatus("Invalid QR code. Please scan a room QR code.");
      setTxStatusType("error");
      return;
    }
    setRoomCode(parsed.code);
    setLabRoom(parsed.name);
    setRoomResult({ code: parsed.code, name: parsed.name });
    setTxStatus("Room found.");
    setTxStatusType("success");
    setStep1Collapsed(true);

    if (!isTimeIn) {
      await handleTimeOut(parsed.code, parsed.name);
    }
  };

  const lookupRoom = () => {
    const codeInput = roomCode.trim();
    if (!codeInput) {
      setTxStatus("Enter a room code first.");
      setTxStatusType("error");
      return;
    }
    const name = codeInput.replace(/-/g, " ").trim();
    setLabRoom(name);
    setRoomResult({ code: codeInput, name });
    setTxStatus("Room found.");
    setTxStatusType("success");
    setStep1Collapsed(true);

    if (!isTimeIn) {
      handleTimeOut(codeInput, name);
    }
  };

  const handleTimeOut = async (code, room) => {
    if (!schoolId) {
      setTxStatus("No student ID found in your profile.");
      setTxStatusType("error");
      return;
    }
    setSubmitting(true);
    setTxStatus("Recording time-out...");
    setTxStatusType("");
    try {
      const result = await api.timeOut({ schoolId });
      setResultData(result.record);
      setTxStatus("");
      toast.success("Time-out recorded!");
    } catch (err) {
      setTxStatus(err.message || "Failed to record time-out");
      setTxStatusType("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCameraTarget(null);
    if (!roomCode.trim()) {
      setTxStatus("Scan or enter a room code first.");
      setTxStatusType("error");
      return;
    }
    if (!subject) {
      setTxStatus("Please select a subject.");
      setTxStatusType("error");
      return;
    }
    if (!professor.trim()) {
      setTxStatus("Please enter professor name.");
      setTxStatusType("error");
      return;
    }
    if (!schoolId) {
      setTxStatus("No student ID found in your profile.");
      setTxStatusType("error");
      return;
    }

    setSubmitting(true);
    setTxStatus("Recording time-in...");
    setTxStatusType("");
    try {
      const result = await api.timeIn({
        schoolId,
        subject,
        professor: professor.trim(),
        labRoom,
        roomCode,
      });
      setResultData(result.record);
      setTxStatus("");
      setStep2Collapsed(true);
      toast.success("Time-in recorded!");
    } catch (err) {
      setTxStatus(err.message || "Failed to record time-in");
      setTxStatusType("error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setRoomCode("");
    setLabRoom("");
    setRoomResult(null);
    setSubject("");
    setProfessor("");
    setTxStatus("");
    setTxStatusType("");
    setResultData(null);
    setStep1Collapsed(false);
    setStep2Collapsed(false);
  };

  return (
    <section className="attendance-scan-page">
      <div className="attendance-scan-header">
        <h1>Scan Attendance</h1>
        <p className="attendance-scan-subtitle">Scan room QR codes to log your laboratory attendance</p>
      </div>

      <div className="attendance-scan-shell">
        {/* Mode Toggle */}
        <div className="attendance-scan-mode">
          <button
            className={`attendance-scan-mode-btn ${isTimeIn ? "active" : ""}`}
            onClick={() => { setMode("time_in"); resetForm(); }}
            type="button"
          >
            <MdLogin size={18} />
            Time-In
          </button>
          <button
            className={`attendance-scan-mode-btn time-out ${!isTimeIn ? "active" : ""}`}
            onClick={() => { setMode("time_out"); resetForm(); }}
            type="button"
          >
            <MdLogout size={18} />
            Time-Out
          </button>
        </div>

        {/* Status Banner */}
        {txStatus && (
          <div className={`attendance-scan-status ${txStatusType}`}>
            {txStatusType === "success" && <MdCheckCircle size={16} />}
            {txStatusType === "error" && <MdError size={16} />}
            <span>{txStatus}</span>
          </div>
        )}

        {/* Success Result */}
        {resultData && (
          <div className={`attendance-scan-result ${resultData.status === "timed_out" ? "time_out" : ""}`}>
            <div className={`attendance-scan-result-icon ${resultData.status === "timed_out" ? "time_out" : "success"}`}>
              {resultData.status === "timed_out" ? <MdLogout size={24} /> : <MdCheckCircle size={24} />}
            </div>
            <div className="attendance-scan-result-info">
              <h3>{resultData.status === "active" ? "Time-In Recorded!" : "Time-Out Recorded!"}</h3>
              <p>{resultData.firstName} {resultData.lastName}</p>
              <div className="attendance-scan-result-detail">
                <span className="label">Student ID</span>
                <span className="value">{resultData.studentSchoolId}</span>
              </div>
              <div className="attendance-scan-result-detail">
                <span className="label">Room</span>
                <span className="value">{resultData.labRoom}</span>
              </div>
              {resultData.status === "active" && (
                <div className="attendance-scan-result-detail">
                  <span className="label">Time-In</span>
                  <span className="value">
                    {resultData.timeIn
                      ? new Date(resultData.timeIn.seconds ? resultData.timeIn.seconds * 1000 : resultData.timeIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
                      : "-"}
                  </span>
                </div>
              )}
              {resultData.status === "timed_out" && resultData.totalDuration != null && (
                <div className="attendance-scan-result-detail">
                  <span className="label">Total Duration</span>
                  <span className="value">{formatDuration(resultData.totalDuration)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Step 1: Room */}
          <div className="scanner-step-card">
            <div className="scanner-step-header">
              <div className={`scanner-step-badge ${step1Collapsed && roomResult ? "completed" : ""}`}>
                {step1Collapsed && roomResult ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                ) : "1"}
              </div>
              <div className="scanner-step-text">
                <h2>Room</h2>
                <p>Scan the room QR code or enter room code manually</p>
              </div>
              {step1Collapsed && roomResult && (
                <button type="button" className="scanner-step-change" onClick={() => { setStep1Collapsed(false); setRoomResult(null); setRoomCode(""); setLabRoom(""); setTxStatus(""); setTxStatusType(""); setResultData(null); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Change
                </button>
              )}
            </div>
            {step1Collapsed && roomResult ? (
              <div className="scanner-step-collapsed" onClick={() => setStep1Collapsed(false)}>
                <div className="scanner-collapsed-info">
                  <MdQrCodeScanner size={16} />
                  <span className="scanner-collapsed-name">{roomResult.name}</span>
                  <span className="scanner-collapsed-id">{roomResult.code}</span>
                </div>
              </div>
            ) : (
              <div className="scanner-step-body">
                <div className="scanner-input-row">
                  <div className="scanner-input-wrap">
                    <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Room code (e.g. computer-lab-1)"
                      value={roomCode}
                      onChange={(e) => { setRoomCode(e.target.value); setRoomResult(null); }}
                    />
                  </div>
                  <button type="button" className="scanner-btn-scan" onClick={() => setCameraTarget("room")}>
                    <MdQrCodeScanner size={16} />
                    Scan
                  </button>
                  <button type="button" className="scanner-btn-find" onClick={lookupRoom}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    Find
                  </button>
                </div>

                {roomResult && (
                  <div className="scanner-result-card">
                    <div className="scanner-result-icon item">
                      <MdQrCodeScanner size={20} />
                    </div>
                    <div className="scanner-result-info">
                      <strong>{roomResult.name}</strong>
                      <div className="scanner-result-meta">
                        <span>{roomResult.code}</span>
                      </div>
                    </div>
                    <svg className="scanner-result-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Camera */}
          {cameraTarget && (
            <ScannerCamera target={cameraTarget} onScan={handleCameraScan} onStop={() => setCameraTarget(null)} />
          )}

          {/* Step 2: Details (Time-In only) */}
          {isTimeIn && (
            <div className="scanner-step-card" ref={step2Ref}>
              <div className="scanner-step-header">
                <div className={`scanner-step-badge ${step2Collapsed && subject && professor ? "completed" : ""}`}>
                  {step2Collapsed && subject && professor ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                  ) : "2"}
                </div>
                <div className="scanner-step-text">
                  <h2>Details</h2>
                  <p>Select subject and enter professor name</p>
                </div>
              </div>
              <div className="scanner-step-body">
                <div className="scanner-fields-grid">
                  <div className="scanner-field">
                    <label>Subject *</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Computer Programming 1"
                      required
                    />
                  </div>
                  <div className="scanner-field">
                    <label>Professor *</label>
                    <input
                      type="text"
                      placeholder="Enter professor name"
                      value={professor}
                      onChange={(e) => setProfessor(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          {isTimeIn ? (
            <button type="submit" className="attendance-scan-submit time-in" disabled={submitting || !roomResult || !subject || !professor}>
              {submitting ? (
                <>
                  <div className="scanner-spinner" />
                  Recording...
                </>
              ) : (
                <>
                  <MdCheckCircle size={18} />
                  Confirm Time-In
                </>
              )}
            </button>
          ) : (
            !resultData && (
              <button type="button" className="attendance-scan-submit time-out" disabled={submitting || !roomResult} onClick={() => handleTimeOut(roomCode, labRoom)}>
                {submitting ? (
                  <>
                    <div className="scanner-spinner" />
                    Recording...
                  </>
                ) : (
                  <>
                    <MdLogout size={18} />
                    Confirm Time-Out
                  </>
                )}
              </button>
            )
          )}

          {/* Reset Button (after success) */}
          {resultData && (
            <button type="button" className="scanner-btn-find" style={{ width: "100%", justifyContent: "center", marginTop: 12, minHeight: 44 }} onClick={resetForm}>
              <MdQrCodeScanner size={16} />
              Scan Next Student
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
