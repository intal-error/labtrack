import { db } from "../../services/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { normalize } from "../../utils/helpers";

function readScanPayload(raw) {
  const match = String(raw || "").trim().match(/^SLSU-(?:TOOL|ITEM)\s*:(.+)$/i);
  return { raw: String(raw || "").trim(), payload: match?.[1]?.trim() || String(raw || "").trim() };
}

function canUseAsDocId(v) { return Boolean(v && !String(v).includes("/")); }

export async function resolveItem(rawCode) {
  const { raw, payload } = readScanPayload(rawCode);
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

export default function ItemLookup({ itemCode, setItemCode, itemResult, setSelectedItem, onLookup, onScan }) {
  const handleChange = (e) => {
    setItemCode(e.target.value);
    setSelectedItem(null);
    setItemResult(null);
  };

  return (
    <div className="scanner-step">
      <div className="scanner-step-heading"><span>2</span><div><h2>Tool or equipment</h2><p>Scan QR code or barcode on the item</p></div></div>
      <div className="scanner-inline">
        <input type="text" placeholder="Tool QR or barcode" value={itemCode} onChange={handleChange} />
        <button type="button" className="btn green" onClick={() => onScan("item")}>Scan tool</button>
        <button type="button" className="btn btn-outline" onClick={onLookup}>Find</button>
      </div>
      {itemResult && (
        <div className="scanner-selection">
          <strong>{itemResult.name}</strong>
          <div>Available: {itemResult.available} of {itemResult.total}{itemResult.condition ? ` | Condition: ${itemResult.condition}` : ""}{itemResult.category ? ` | Category: ${itemResult.category}` : ""}</div>
        </div>
      )}
    </div>
  );
}
