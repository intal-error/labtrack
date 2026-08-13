import { db } from "../../services/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { normalize } from "../../utils/helpers";

function readScanPayload(raw) {
  const match = String(raw || "").trim().match(/^SLSU-(?:USER|BORROWER|STUDENT)\s*:(.+)$/i);
  return { raw: String(raw || "").trim(), payload: match?.[1]?.trim() || String(raw || "").trim() };
}

function canUseAsDocId(v) { return Boolean(v && !String(v).includes("/")); }

export async function resolveUser(rawCode) {
  const { raw, payload } = readScanPayload(rawCode);
  const ids = [...new Set([payload, raw].filter(canUseAsDocId))];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "users", id));
    if (snap.exists()) return { id: snap.id, data: snap.data(), scanCode: raw };
  }
  const candidates = new Set([normalize(raw), normalize(payload)]);
  const uSnap = await getDocs(collection(db, "users"));
  const match = uSnap.docs.find((d) => {
    const u = d.data();
    return [u.schoolID, u.studentID, u.barcode, u.qrCode].some((v) => candidates.has(normalize(v)));
  });
  return match ? { id: match.id, data: match.data(), scanCode: raw } : null;
}

export default function BorrowerLookup({ schoolId, setSchoolId, borrowerResult, setBorrowerResult, setSelectedUser, onLookup, onScan }) {
  const handleChange = (e) => {
    setSchoolId(e.target.value);
    setSelectedUser(null);
    setBorrowerResult(null);
  };

  return (
    <div className="scanner-step">
      <div className="scanner-step-heading"><span>1</span><div><h2>Borrower</h2><p>Scan or enter school ID</p></div></div>
      <div className="scanner-inline">
        <input type="text" placeholder="School ID" value={schoolId} onChange={handleChange} />
        <button type="button" className="btn green" onClick={() => onScan("borrower")}>Scan ID</button>
        <button type="button" className="btn btn-outline" onClick={onLookup}>Find</button>
      </div>
      {borrowerResult && (
        <div className="scanner-selection">
          <strong>{borrowerResult.name}</strong>
          <div>School ID: {borrowerResult.schoolID}{borrowerResult.role ? ` | Role: ${borrowerResult.role}` : ""}{borrowerResult.course ? ` | Course: ${borrowerResult.course}` : ""}</div>
        </div>
      )}
    </div>
  );
}
