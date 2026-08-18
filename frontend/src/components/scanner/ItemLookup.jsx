import { db } from "../../services/firebase";
import { doc, getDoc, query, where, limit, getDocs, collection } from "firebase/firestore";
import { normalize, readScanPayload, canUseAsDocId } from "../../utils/helpers";

export async function resolveItem(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "TOOL|ITEM");
  const ids = [...new Set([payload, raw].filter(canUseAsDocId))];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "catalog", id));
    if (snap.exists()) return { id: snap.id, data: snap.data(), scanCode: raw };
  }
  const candidates = [normalize(raw), normalize(payload)].filter(Boolean);
  if (candidates.length === 0) return null;

  const fields = ["barcode", "assetTag", "itemCode", "qrCode", "scanCode"];
  for (const field of fields) {
    for (const candidate of candidates) {
      try {
        const q = query(collection(db, "catalog"), where(field, "==", candidate), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          return { id: d.id, data: d.data(), scanCode: raw };
        }
      } catch {
        // Field may not have an index, skip
      }
    }
  }
  return null;
}
