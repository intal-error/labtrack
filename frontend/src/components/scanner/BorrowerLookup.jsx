import { api } from "../../services/api";
import { readScanPayload, canUseAsDocId } from "../../utils/helpers";
import { sanitizeSearchInput } from "../../utils/search";

/**
 * Resolves a scanned QR payload to a user document.
 *
 * WHY THIS IS AN API CALL NOW: it used to hit Firestore directly from the
 * browser -- a doc-id getDoc, then up to six field-equality queries. Importing
 * `firebase/firestore` for that dragged the entire Firestore SDK (215 kB of the
 * 562 kB entry chunk) into the eager bundle, re-downloaded on every app-code
 * deploy, to do single-document reads the server was already doing.
 *
 * The server owns this data and can answer in one round trip instead of seven.
 * The return shape is unchanged ({ id, data, scanCode } | null), so
 * EquipmentScanner is untouched.
 *
 * A failure now throws instead of returning null. Returning null on a network
 * error made the scanner say "unknown borrower" for what was really a dropped
 * connection, which is worse than an explicit error: an operator would send a
 * real student away over a transient blip.
 */
export async function resolveUser(rawCode) {
  const { raw, payload } = readScanPayload(rawCode, "USER|BORROWER|STUDENT");

  const trimmed = [raw, payload].map((v) => String(v || "").trim()).filter(Boolean);
  const normalized = trimmed.map((v) => sanitizeSearchInput(v));
  const candidates = [...new Set([...trimmed, ...normalized])].filter(Boolean);
  if (candidates.length === 0) return null;

  // doc-id candidates first -- the common case for our own generated codes --
  // then the id/barcode fields, matching the order the old client loop used.
  const ids = [...new Set([payload, raw].filter(canUseAsDocId))];

  const found = await api.resolveUserCode({
    code: raw,
    candidates: candidates.join(","),
    ids: ids.join(","),
  });

  if (!found?.user) return null;
  return { id: found.user.id, data: found.user, scanCode: raw };
}
