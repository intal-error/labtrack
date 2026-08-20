import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { db } from "../services/firebase";
import { getDocs, collection, query, where } from "firebase/firestore";
import { toDate, numOr, getAvailableQuantity, isOpenBorrow, normalize } from "../utils/helpers";
import { resolveUser } from "../components/scanner/BorrowerLookup";
import { resolveItem } from "../components/scanner/ItemLookup";
import ScannerCamera from "../components/scanner/ScannerCamera";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import "../styles/pages/scanner.css";

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(17, 0, 0, 0);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default function ScannerPage() {
  const { userProfile } = useAuth();
  const [action, setAction] = useState("borrowed");
  const [schoolId, setSchoolId] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("");
  const [contact, setContact] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [borrowerResult, setBorrowerResult] = useState(null);
  const [itemResult, setItemResult] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [txStatus, setTxStatus] = useState("");
  const [txStatusType, setTxStatusType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const step2Ref = useRef(null);

  useEffect(() => {
    setDueDate(defaultDueDate());
  }, []);

  useEffect(() => {
    if (action === "returned") setDueDate("");
    else if (!dueDate) setDueDate(defaultDueDate());
  }, [action]);

  // Auto-fill borrower from logged-in user
  useEffect(() => {
    if (userProfile) {
      const d = userProfile;
      setSchoolId(d.schoolId || d.schoolID || d.studentID || d.employeeId || "");
      setFirstName(d.firstName || d.firstname || "");
      setLastName(d.lastName || d.lastname || "");
      setEmail(d.email || "");
      setRole(d.role === "faculty" ? "faculty" : "student");
      setCourse(d.course || "");
      setYear(d.year || "");
      setContact(d.contact || d.contactNumber || "");
      setDepartment(d.department || "");
      setPosition(d.position || "");
      setSelectedUser(userProfile);
      setBorrowerResult({
        name: `${d.firstName || d.firstname || ""} ${d.lastName || d.lastname || ""}`.trim(),
        schoolID: d.schoolId || d.schoolID || d.studentID || d.employeeId,
        role: d.role,
        course: d.course,
        year: d.year,
        department: d.department,
        position: d.position,
        contact: d.contact || d.contactNumber,
        email: d.email,
        profileURL: d.profileURL,
      });
    }
  }, [userProfile]);

  const scrollToStep2 = () => {
    setTimeout(() => {
      step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };

  const lookupBorrower = async () => {
    if (!schoolId.trim()) { setTxStatus("Enter a school ID first."); setTxStatusType("error"); return; }
    setTxStatus("Looking for borrower..."); setTxStatusType("");
    const user = await resolveUser(schoolId.trim());
    if (!user) {
      setSelectedUser(null); setBorrowerResult(null);
      setTxStatus("No registered borrower found. Fill in name fields to create on borrow."); setTxStatusType("error");
      return;
    }
    setSelectedUser(user);
    const d = user.data;
    setFirstName(d.firstName || d.firstname || "");
    setLastName(d.lastName || d.lastname || "");
    setEmail(d.email || "");
    setRole(d.role === "faculty" ? "faculty" : "student");
    setBorrowerResult({ name: `${d.firstName || ""} ${d.lastName || ""}`.trim(), schoolID: d.schoolID || schoolId, role: d.role, course: d.course });
    setTxStatus("Borrower found."); setTxStatusType("success");
    scrollToStep2();
  };

  const lookupItem = async () => {
    if (!itemCode.trim()) { setTxStatus("Enter an item code first."); setTxStatusType("error"); return; }
    setTxStatus("Looking for item..."); setTxStatusType("");
    const item = await resolveItem(itemCode.trim());
    if (!item) {
      setSelectedItem(null); setItemResult(null);
      setTxStatus("No matching catalog item found."); setTxStatusType("error");
      return;
    }
    setSelectedItem(item);
    const d = item.data;
    const avail = getAvailableQuantity(d);
    setItemResult({ name: d.itemName, available: avail, total: numOr(d.quantity), condition: d.condition, category: d.category });
    setTxStatus("Item found."); setTxStatusType("success");
  };

  const handleCameraScan = async (decodedText) => {
    if (cameraTarget === "borrower") { setSchoolId(decodedText); setTimeout(() => lookupBorrower(), 100); }
    else { setItemCode(decodedText); setTimeout(() => lookupItem(), 100); }
    setCameraTarget(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCameraTarget(null);
    if (!schoolId.trim()) { setTxStatus("School ID required."); setTxStatusType("error"); return; }
    if (!selectedItem) { setTxStatus("Scan or find an item first."); setTxStatusType("error"); return; }
    const qty = Math.floor(numOr(quantity));
    if (qty < 1) { setTxStatus("Quantity must be at least 1."); setTxStatusType("error"); return; }
    if (action === "borrowed" && (!firstName.trim() || !lastName.trim())) { setTxStatus("First and last name required."); setTxStatusType("error"); return; }

    setSubmitting(true);
    setTxStatus(action === "borrowed" ? "Recording borrow..." : "Recording return...");
    try {
      if (action === "borrowed") {
        const due = new Date(dueDate);
        if (isNaN(due.getTime()) || due.getTime() <= Date.now()) throw new Error("Choose a future due date");
        await api.recordBorrow({
          itemId: selectedItem.id,
          borrower: { schoolID: schoolId.trim(), firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role, userId: selectedUser?.id },
          quantity: qty,
          dueDate: due.toISOString(),
        });
      } else {
        const borrowSnap = await getDocs(query(collection(db, "transactions"), where("action", "==", "borrowed")));
        const normalizedSid = normalize(schoolId);
        const match = borrowSnap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter(({ data }) => isOpenBorrow(data))
          .filter(({ data }) => normalize(data.schoolID) === normalizedSid)
          .filter(({ data }) => (data.catalogId || data.itemId) === selectedItem.id)
          .sort((a, b) => (toDate(b.data.timestamp)?.getTime() || 0) - (toDate(a.data.timestamp)?.getTime() || 0))[0];
        if (!match) throw new Error("No active loan found");
        await api.recordReturn({ borrowId: match.id, itemId: selectedItem.id, schoolID: schoolId.trim(), quantity: qty });
      }
      toast.success(action === "borrowed" ? "Borrow recorded!" : "Return recorded!");
      resetForm();
    } catch (err) {
      toast.error(err.message || "Transaction failed");
      setTxStatus(err.message); setTxStatusType("error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setItemCode("");
    setSelectedItem(null); setItemResult(null);
    setTxStatus(""); setTxStatusType("");
    setDueDate(defaultDueDate());
    // Keep borrower info if user is logged in
    if (userProfile) {
      setSchoolId(userProfile.schoolId || userProfile.schoolID || userProfile.studentID || userProfile.employeeId || "");
      setFirstName(userProfile.firstName || userProfile.firstname || "");
      setLastName(userProfile.lastName || userProfile.lastname || "");
      setEmail(userProfile.email || "");
      setRole(userProfile.role === "faculty" ? "faculty" : "student");
      setCourse(userProfile.course || "");
      setYear(userProfile.year || "");
      setContact(userProfile.contact || userProfile.contactNumber || "");
      setDepartment(userProfile.department || "");
      setPosition(userProfile.position || "");
      setSelectedUser(userProfile);
      setBorrowerResult({
        name: `${userProfile.firstName || userProfile.firstname || ""} ${userProfile.lastName || userProfile.lastname || ""}`.trim(),
        schoolID: userProfile.schoolId || userProfile.schoolID || userProfile.studentID || userProfile.employeeId,
        role: userProfile.role,
        course: userProfile.course,
        year: userProfile.year,
        department: userProfile.department,
        position: userProfile.position,
        contact: userProfile.contact || userProfile.contactNumber,
        email: userProfile.email,
        profileURL: userProfile.profileURL,
      });
    }
  };

  const isBorrow = action === "borrowed";

  return (
    <section className="scanner-page">
      <div className="scanner-header">
        <h1>Scan Borrow / Return</h1>
        <p className="scanner-subtitle">Scan QR codes or enter codes manually to borrow or return equipment</p>
      </div>

      <div className="scanner-shell">
        <div className="scanner-mode">
          <button className={`scanner-mode-btn ${isBorrow ? "active" : ""}`} onClick={() => setAction("borrowed")} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Borrow
          </button>
          <button className={`scanner-mode-btn ${!isBorrow ? "active" : ""}`} onClick={() => setAction("returned")} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Return
          </button>
        </div>

        {txStatus && (
          <div className={`scanner-status-banner ${txStatusType}`}>
            {txStatusType === "success" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>}
            {txStatusType === "error" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            {!txStatusType && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
            <span>{txStatus}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="scanner-step-card">
            <div className="scanner-step-header">
              <div className="scanner-step-badge">1</div>
              <div className="scanner-step-text">
                <h2>{isBorrow ? "Borrower" : "Returner"}</h2>
                <p>{borrowerResult ? "Account verified from login session" : "Scan or enter school ID"}</p>
              </div>
            </div>
            <div className="scanner-step-body">
              {borrowerResult ? (
                <div className="scanner-user-profile">
                  <div className="scanner-user-profile-header">
                    {borrowerResult.profileURL ? (
                      <img src={borrowerResult.profileURL} alt="" className="scanner-user-avatar" />
                    ) : (
                      <div className="scanner-user-avatar-placeholder">
                        {(borrowerResult.name || "U")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="scanner-user-profile-info">
                      <div className="scanner-user-name">{borrowerResult.name}</div>
                      <div className="scanner-user-id">{borrowerResult.schoolID}</div>
                      <div className={`scanner-user-role ${borrowerResult.role}`}>
                        {borrowerResult.role === "faculty" ? "Faculty" : "Student"}
                      </div>
                    </div>
                    <div className="scanner-user-verified">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                    </div>
                  </div>
                  <div className="scanner-user-details">
                    {borrowerResult.email && (
                      <div className="scanner-user-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <span>{borrowerResult.email}</span>
                      </div>
                    )}
                    {borrowerResult.course && (
                      <div className="scanner-user-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                        <span>{borrowerResult.course}{borrowerResult.year ? ` - ${borrowerResult.year}` : ""}</span>
                      </div>
                    )}
                    {borrowerResult.department && (
                      <div className="scanner-user-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        <span>{borrowerResult.department}{borrowerResult.position ? ` - ${borrowerResult.position}` : ""}</span>
                      </div>
                    )}
                    {borrowerResult.contact && (
                      <div className="scanner-user-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        <span>{borrowerResult.contact}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="scanner-input-row">
                  <div className="scanner-input-wrap">
                    <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                    <input type="text" placeholder="School ID" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setSelectedUser(null); setBorrowerResult(null); }} />
                  </div>
                  <button type="button" className="scanner-btn-scan" onClick={() => setCameraTarget("borrower")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Scan
                  </button>
                  <button type="button" className="scanner-btn-find" onClick={lookupBorrower}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    Find
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="scanner-step-card" ref={step2Ref}>
            <div className="scanner-step-header">
              <div className="scanner-step-badge">2</div>
              <div className="scanner-step-text">
                <h2>Tool or Equipment</h2>
                <p>Scan QR code or barcode on the item</p>
              </div>
            </div>
            <div className="scanner-step-body">
              <div className="scanner-input-row">
                <div className="scanner-input-wrap">
                  <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  <input type="text" placeholder="Tool QR or barcode" value={itemCode} onChange={(e) => { setItemCode(e.target.value); setSelectedItem(null); setItemResult(null); }} />
                </div>
                <button type="button" className="scanner-btn-scan" onClick={() => setCameraTarget("item")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Scan
                </button>
                <button type="button" className="scanner-btn-find" onClick={lookupItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  Find
                </button>
              </div>

              {itemResult && (
                <div className={`scanner-result-card ${itemResult.available <= 0 ? "low-stock" : itemResult.available <= 2 ? "warn-stock" : ""}`}>
                  <div className="scanner-result-icon item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                  </div>
                  <div className="scanner-result-info">
                    <strong>{itemResult.name}</strong>
                    <div className="scanner-result-meta">
                      <span className={itemResult.available <= 0 ? "stock-out" : itemResult.available <= 2 ? "stock-low" : ""}>
                        {itemResult.available} of {itemResult.total} available
                      </span>
                      {itemResult.condition && <span>{itemResult.condition}</span>}
                      {itemResult.category && <span>{itemResult.category}</span>}
                    </div>
                  </div>
                  <svg className="scanner-result-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                </div>
              )}
            </div>
          </div>

          {cameraTarget && (
            <ScannerCamera target={cameraTarget} onScan={handleCameraScan} onStop={() => setCameraTarget(null)} />
          )}

          <div className="scanner-transaction-card">
            <div className="scanner-transaction-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
              <span>Transaction Details</span>
            </div>
            <div className="scanner-transaction-grid">
              <div className="scanner-field">
                <label>Quantity</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>
              {isBorrow && (
                <div className="scanner-field">
                  <label>Due Date & Time</label>
                  <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              )}
            </div>
            {isBorrow && (
              <div className="scanner-due-shortcuts">
                <span className="due-shortcut-label">Quick due date:</span>
                <div className="due-shortcut-btns">
                  {[{ label: "1 day", days: 1 }, { label: "3 days", days: 3 }, { label: "7 days", days: 7 }, { label: "2 weeks", days: 14 }].map(({ label, days }) => (
                    <button key={days} type="button" className="due-shortcut-btn" onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      d.setHours(17, 0, 0, 0);
                      const offset = d.getTimezoneOffset() * 60000;
                      setDueDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button type="submit" className={`scanner-submit-btn ${action}`} disabled={submitting}>
            {submitting ? (
              <>
                <div className="scanner-spinner" />
                Recording...
              </>
            ) : (
              <>
                {isBorrow ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                )}
                {isBorrow ? "Record Borrow" : "Record Return"}
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
