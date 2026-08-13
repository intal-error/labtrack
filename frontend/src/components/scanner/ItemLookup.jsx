import { db } from "../../services/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { normalize, readScanPayload, canUseAsDocId } from "../../utils/helpers";

export async function resolveItem(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "TOOL|ITEM");
  const ids = [...new Set([payload, raw].filter(canUseAsDocId))];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "catalog", id));
    if (snap.exists()) return { id: snap.id, data: snap.data(), scanCode: raw };
  }
  const candidates = new Set([normalize(raw), normalize(payload)]);
  const catSnap = await getDocs(collection(db, "catalog"));
  const match = catSnap.docs.find((d) => {
    const item = d.data();
    return [item.barcode, item.assetTag, item.itemCode, item.qrCode, item.scanCode].some((v) => candidates.has(normalize(v)));
  });
  return match ? { id: match.id, data: match.data(), scanCode: raw } : null;
}
