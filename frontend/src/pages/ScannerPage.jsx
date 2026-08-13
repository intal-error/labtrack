import { useState, useEffect } from "react";
import { api } from "../services/api";
import { db } from "../services/firebase";
import { getDocs, collection, query, where } from "firebase/firestore";
import { toDate, numOr, getAvailableQuantity, isOpenBorrow, normalize } from "../utils/helpers";
import { resolveUser } from "../components/scanner/BorrowerLookup";
import { resolveItem } from "../components/scanner/ItemLookup";
import ScannerCamera from "../components/scanner/ScannerCamera";
import toast from "react-hot-toast";
import "../styles/pages/scanner.css";

export default function ScannerPage() {
  const [action, setAction] = useState("borrowed");
  const [schoolId, setSchoolId] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Student");
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

  useEffect(() => {
    const now = new Date(Date.now() + 86400000);
    const offset = now.getTimezoneOffset() * 60000;
    setDueDate(new Date(now.getTime() - offset).toISOString().slice(0, 16));
  }, []);

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
    setRole(d.role === "faculty" ? "faculty" : "Student");
    setBorrowerResult({ name: `${d.firstName || ""} ${d.lastName || ""}`.trim(), schoolID: d.schoolID || schoolId, role: d.role, course: d.course });
    setTxStatus("Borrower found."); setTxStatusType("success");
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
    setSchoolId(""); setItemCode(""); setFirstName(""); setLastName(""); setEmail(""); setQuantity(1);
    setSelectedItem(null); setSelectedUser(null); setBorrowerResult(null); setItemResult(null);
    setTxStatus(""); setTxStatusType("");
  };

  return (
    <section className="scanner-page">
      <h1>SCAN BORROW / RETURN</h1>
      <div className="scanner-shell">
        <p className="scanner-help">Use a phone camera to scan borrower ID and tool QR code/barcode, or enter codes manually.</p>

        <div className="scanner-mode">
          <button className={`btn ${action === "borrowed" ? "green scanner-mode-active" : "btn-outline"}`} onClick={() => setAction("borrowed")} type="button">Borrow</button>
          <button className={`btn ${action === "returned" ? "green scanner-mode-active" : "btn-outline"}`} onClick={() => setAction("returned")} type="button">Return</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="scanner-step">
            <div className="scanner-step-heading"><span>1</span><div><h2>Borrower</h2><p>Scan or enter school ID</p></div></div>
            <div className="scanner-inline">
              <input type="text" placeholder="School ID" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setSelectedUser(null); setBorrowerResult(null); }} />
              <button type="button" className="btn green" onClick={() => setCameraTarget("borrower")}>Scan ID</button>
              <button type="button" className="btn btn-outline" onClick={lookupBorrower}>Find</button>
            </div>
            {borrowerResult && <div className="scanner-selection"><strong>{borrowerResult.name}</strong><div>School ID: {borrowerResult.schoolID}{borrowerResult.role ? ` | Role: ${borrowerResult.role}` : ""}{borrowerResult.course ? ` | Course: ${borrowerResult.course}` : ""}</div></div>}
            <div className="scanner-borrower-fields">
              <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required={action === "borrowed"} />
              <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required={action === "borrowed"} />
              <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="full-width" />
              <select value={role} onChange={(e) => setRole(e.target.value)}><option value="Student">Student</option><option value="faculty">Faculty</option></select>
            </div>
          </div>

          <div className="scanner-step">
            <div className="scanner-step-heading"><span>2</span><div><h2>Tool or equipment</h2><p>Scan QR code or barcode on the item</p></div></div>
            <div className="scanner-inline">
              <input type="text" placeholder="Tool QR or barcode" value={itemCode} onChange={(e) => { setItemCode(e.target.value); setSelectedItem(null); setItemResult(null); }} />
              <button type="button" className="btn green" onClick={() => setCameraTarget("item")}>Scan tool</button>
              <button type="button" className="btn btn-outline" onClick={lookupItem}>Find</button>
            </div>
            {itemResult && <div className="scanner-selection"><strong>{itemResult.name}</strong><div>Available: {itemResult.available} of {itemResult.total}{itemResult.condition ? ` | Condition: ${itemResult.condition}` : ""}{itemResult.category ? ` | Category: ${itemResult.category}` : ""}</div></div>}
          </div>

          {cameraTarget && (
            <ScannerCamera target={cameraTarget} onScan={handleCameraScan} onStop={() => setCameraTarget(null)} />
          )}

          <div className="scanner-transaction-fields">
            <label>Quantity</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            {action === "borrowed" && (
              <>
                <label>Due date and time</label>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </>
            )}
          </div>

          <button type="submit" className="btn green scanner-submit" disabled={submitting}>
            {submitting ? "Recording..." : action === "borrowed" ? "Record Borrow" : "Record Return"}
          </button>
          {txStatus && <p className={`scanner-transaction-status ${txStatusType === "success" ? "is-success" : txStatusType === "error" ? "is-error" : ""}`}>{txStatus}</p>}
        </form>
      </div>
    </section>
  );
}
