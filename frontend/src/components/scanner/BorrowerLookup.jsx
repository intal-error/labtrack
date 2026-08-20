import { db } from "../../services/firebase";
import { doc, getDoc, query, where, limit, getDocs, collection } from "firebase/firestore";
import { normalize, readScanPayload, canUseAsDocId } from "../../utils/helpers";

export async function resolveUser(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "USER|BORROWER|STUDENT");
  const ids = [...new Set([payload, raw].filter(canUseAsDocId))];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "users", id));
    if (snap.exists()) return { id: snap.id, data: snap.data(), scanCode: raw };
  }

  const trimmed = [raw, payload].map((v) => String(v || "").trim()).filter(Boolean);
  const normalized = trimmed.map((v) => normalize(v));
  const candidates = [...new Set([...trimmed, ...normalized])].filter(Boolean);
  if (candidates.length === 0) return null;

  const fields = ["schoolId", "employeeId", "schoolID", "studentID", "barcode", "qrCode"];
  for (const field of fields) {
    for (const candidate of candidates) {
      try {
        const q = query(collection(db, "users"), where(field, "==", candidate), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          return { id: d.id, data: d.data(), scanCode: raw };
        }
      } catch (err) {
        console.warn(`BorrowerLookup: query on field "${field}" failed:`, err.message);
      }
    }
  }
  return null;
}
