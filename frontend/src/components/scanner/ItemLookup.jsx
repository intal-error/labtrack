import { auth } from "../../services/firebase";
import { getIdToken } from "firebase/auth";
import { sanitizeSearchInput } from "../../utils/search";
import { readScanPayload } from "../../utils/helpers";

const API_URL = import.meta.env.VITE_API_URL || "/api";

async function apiLookup(code) {
  try {
    const headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const res = await fetch(`${API_URL}/catalog/lookup/barcode/${encodeURIComponent(code)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, data, scanCode: code };
  } catch {
    return null;
  }
}

export async function resolveItem(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "TOOL|ITEM");
  const candidates = [sanitizeSearchInput(raw), sanitizeSearchInput(payload)].filter(Boolean);

  for (const candidate of candidates) {
    const result = await apiLookup(candidate);
    if (result) return result;
  }

  return null;
}
