import { db } from "../../services/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { normalize, readScanPayload, canUseAsDocId } from "../../utils/helpers";

export async function resolveUser(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "USER|BORROWER|STUDENT");
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
