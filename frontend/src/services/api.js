import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const TIMEOUT_MS = 30000;
const DOCUMENT_UPLOAD_TIMEOUT_MS = 120000;

function toQuery(params) {
  if (!params) return "";
  if (typeof params === "string") {
    return params.startsWith("?") ? params : `?${params}`;
  }
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : "";
}

/**
 * Builds the thrown Error from a failed response.
 *
 * WHY the detail append: every zod schema on the backend answers 400 with
 * `{ error: "Validation failed", details: ["field: message", ...] }`. Only the
 * generic "Validation failed" was being kept, so a schema rejecting a perfectly
 * legal form produced a toast naming no field and no reason. That is not
 * hypothetical — the incident-date rule rejected the form's own default value
 * this way and the only symptom on screen was the word "Validation failed".
 *
 * Every consumer reads err.message and several match it with .includes(), so
 * appending is additive: existing fallbacks and substring checks keep working.
 */
function toError(body, status) {
  const message = body?.error || `HTTP ${status}`;
  const details = Array.isArray(body?.details) ? body.details.filter(Boolean) : [];
  return new Error(details.length ? `${message}: ${details.join("; ")}` : message);
}

/**
 * Combines the caller's abort signal with our own timeout into one.
 *
 * WHY THIS EXISTS: React Query passes an AbortSignal to every queryFn, but none of
 * them declared it, so cancellation never reached fetch. Superseding a request (change
 * a filter, click page 2, type another character) told React Query to discard the
 * response -- while the server kept working on it. On this app that mattered: the
 * superseded request was typically a full-table scan, so every filter change left
 * expensive queries running to completion in the background with nobody reading the
 * answer.
 *
 * AbortSignal.any would be tidier but needs a polyfill on older Safari, which is
 * exactly where a lab tablet or an older Android phone might sit. So the two signals
 * are wired together by hand.
 */
function combineSignals(externalSignal, timeoutMs) {
  const controller = new AbortController();
  // Set by the timer, and read at CATCH time. Inferring the cause from
  // `externalSignal.aborted` instead is a race: both causes abort this same
  // controller, and a query superseded in the few milliseconds AFTER a timeout would
  // make a genuine timeout look like a cancellation -- which React Query drops
  // silently, turning "server was too slow, retry" into "user moved on, discard"
  // and losing the record of a real failure.
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  // Abort with a TimeoutError reason so the cause survives in the thrown error too,
  // not only in this closure.
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/**
 * Maps a fetch rejection to the message a user should actually see.
 *
 * The distinction matters more than it looks: "Server is offline" sends someone to
 * troubleshoot their Wi-Fi, "Request timed out" tells them the server is slow and the
 * data is unchanged. Conflating them makes a slow report export look like a dead
 * network -- and the offline banner, which keys off navigator.onLine, stays hidden
 * while the app claims to be offline.
 */
function describeNetworkError(err) {
  if (err.name === "TimeoutError") return "Request timed out. The server is slow to respond.";
  if (err.name === "AbortError") return "Request cancelled.";
  // `Failed to fetch` is Chrome's wording only: Firefox says "NetworkError when
  // attempting to fetch resource." and iOS Safari says "Load failed" -- and iOS is
  // exactly where a kiosk tablet would be. A rejected fetch is a TypeError in all of
  // them, which is the portable test.
  if (err instanceof TypeError) return "Server is offline. Please try again later.";
  return "Network error. Please try again.";
}

async function request(path, options = {}) {
  // Pulled out of `options` so it is never spread into the fetch init, and so the
  // timeout wrapper can combine with it.
  const { signal: externalSignal, ...rest } = options;

  let headers = { "Content-Type": "application/json", ...rest.headers };

  if (auth.currentUser) {
    try {
      const token = await getIdToken(auth.currentUser);
      headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Token refresh failed, continue without token
    }
  }

  const abort = combineSignals(externalSignal, TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      signal: abort.signal,
    });
  } catch (err) {
    // A superseded query rethrows the raw AbortError untouched, which React Query
    // recognises as "this was cancelled" and does not retry. A timeout becomes an
    // ordinary Error, so it IS retried -- which is the intended difference.
    if (err.name === "AbortError" && !abort.didTimeout()) throw err;
    throw new Error(describeNetworkError(err));
  } finally {
    abort.cleanup();
  }

  // `res.json()` is inside the try because it is still part of the request: an HTML
  // error page served with a 200 (a misconfigured proxy does this) would otherwise
  // surface as a raw SyntaxError in a toast. The timeout is also still armed here,
  // so a stalled body read is bounded -- previously cleanup() ran first, leaving the
  // body read with no ceiling at all.
  try {
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw toError(body, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error(describeNetworkError(err));
    }
    throw err;
  } finally {
    abort.cleanup();
  }
}


export const api = {
  getBorrowed: (params, signal) => request(`/transactions/borrowed${toQuery(params)}`, { signal }),
  getReturned: (params, signal) => request(`/transactions/returned${toQuery(params)}`, { signal }),
  getMyBorrowed: (params, signal) => request(`/transactions/my-borrowed${toQuery(params)}`, { signal }),
  getMyReturned: (params, signal) => request(`/transactions/my-returned${toQuery(params)}`, { signal }),
  getMyTransactionStats: (signal) => request("/transactions/my-stats", { signal }),
  getTransactionStats: (signal) => request("/transactions/stats", { signal }),
  recordBorrow: (data) => request("/transactions/borrow", { method: "POST", body: JSON.stringify(data) }),
  recordReturn: (data) => request("/transactions/return", { method: "POST", body: JSON.stringify(data) }),
  recordMyReturn: (data) => request("/transactions/my-return", { method: "POST", body: JSON.stringify(data) }),

getCatalog: (params, signal) => request(`/catalog${toQuery(params)}`, { signal }),
  // Narrow projection for pickers and previews: no long text columns, no
  // pagination envelope. See catalogController.getOptions.
  getCatalogOptions: (signal) => request("/catalog/options", { signal }),
  getCatalogStats: (signal) => request("/catalog/stats", { signal }),
  createCatalogItem: (data) => request("/catalog", { method: "POST", body: JSON.stringify(data) }),
  updateCatalogItem: (id, data) => request(`/catalog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCatalogItem: (id) => request(`/catalog/${id}`, { method: "DELETE" }),

searchUser: (firstName, lastName, signal) => request(`/users/search?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`, { signal }),

  // Paginated student roster, scoped server-side to the caller's course.
  //
  // ?course= is a SUPER ADMIN filter; the backend ignores it for a Course Admin, so
  // it is never safe to rely on client-side for scoping. A Course Admin also cannot
  // list another admin: GET /api/admin returns only their own record.
  getStudents: (params, signal) => request(`/users${toQuery(params)}`, { signal }),

  // Course scopes. Readable by every admin; only the Super Admin may write.
  getCourses: (signal) => request("/courses", { signal }),

  // Replaces a client-side Firestore lookup in BorrowerLookup.jsx.
  resolveUserCode: ({ code, candidates, ids }) =>
    request(`/users/resolve${toQuery({ code, candidates, ids })}`),

  getAdmins: (signal) => request("/admin", { signal }),
  createAdmin: (data) => request("/admin", { method: "POST", body: JSON.stringify(data) }),
  updateAdmin: (id, data) => request(`/admin/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAdmin: (id) => request(`/admin/${id}`, { method: "DELETE" }),

  getReportSummary: (params, signal) => request(`/reports/summary${toQuery(params)}`, { signal }),

  downloadReport: async (type, params = "") => {
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const query = params ? `?${params}` : "";
    let res;
    try {
      res = await fetch(`${API_URL}/reports/${type}${query}`, { headers, signal: controller.signal });
    } catch (err) {
      // A 30 s timeout on a large report used to be reported as "Server is offline",
      // sending the user to troubleshoot a network that was working fine.
      throw new Error(describeNetworkError(err));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const a = document.createElement("a");
    a.href = url;
    a.download = match?.[1] || `${type}_report.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_URL}/upload/image`, { method: "POST", headers, body: formData, signal: controller.signal });
    } catch (err) {
      throw new Error(describeNetworkError(err));
    } finally {
      clearTimeout(timer);
    }
    // toError, not a bare "Upload failed". This endpoint has four distinct
    // failure modes that all used to reach the user as that one string:
    // storage not configured (503), a rejected file type, an oversized file,
    // and a spent rate limit (429). Discarding the body meant a missing
    // CLOUDINARY_CLOUD_NAME in production looked exactly like a bad photo,
    // and cost a full deploy cycle to tell apart.
    if (!res.ok) throw toError(await res.json().catch(() => ({})), res.status);
    return res.json();
  },

  uploadDocument: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOCUMENT_UPLOAD_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_URL}/upload/document`, { method: "POST", headers, body: formData, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Upload timed out. Try a smaller file.");
      throw new Error("Server is offline. Please try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw toError(await res.json().catch(() => ({})), res.status);
    return res.json();
  },

  generateQR: (text) => request("/upload/qr", { method: "POST", body: JSON.stringify({ text }) }),

  register: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  // Resolves the signed-in user's own Firestore document.
  //
  // This replaced two client-side getDoc() calls in AuthContext, which is what
  // forced `firebase/firestore` into the eagerly-loaded entry chunk. See the
  // note on authController.getProfile for the full reasoning.
  getProfile: (signal) => request("/auth/profile", { signal }),
  updateProfile: (data) => request("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data) => request("/auth/password", { method: "PUT", body: JSON.stringify(data) }),

  // Notifications
  getNotifications: (params, signal) => request(`/notifications${toQuery(params)}`, { signal }),
  getMyNotifications: (params, signal) => request(`/notifications/user${toQuery(params)}`, { signal }),
  createNotification: (data) => request("/notifications", { method: "POST", body: JSON.stringify(data) }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PUT" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "PUT" }),
  dismissNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),

  // Documents
  getDocuments: (signal) => request("/documents", { signal }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: (signal) => request("/settings", { signal }),
  saveSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Maintenance
  getMaintenance: (params, signal) => request(`/maintenance${toQuery(params)}`, { signal }),
  createMaintenance: (data) => request("/maintenance", { method: "POST", body: JSON.stringify(data) }),
  updateMaintenance: (id, data) => request(`/maintenance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMaintenance: (id) => request(`/maintenance/${id}`, { method: "DELETE" }),

  // Incident Reports
  // One endpoint per intent so the workflow cannot be short-circuited by a
  // generic update: status, remark and reassignment are separate verbs, each
  // re-validating the current state server-side.
  getIncidents: (params, signal) => request(`/incidents${toQuery(params)}`, { signal }),
  getMyIncidents: (params, signal) => request(`/incidents/mine${toQuery(params)}`, { signal }),
  getIncident: (id, signal) => request(`/incidents/${id}`, { signal }),
  createIncident: (data) => request("/incidents", { method: "POST", body: JSON.stringify(data) }),
  updateIncidentStatus: (id, status, note) =>
    request(`/incidents/${id}/status`, { method: "PUT", body: JSON.stringify({ status, note }) }),
  addIncidentRemark: (id, note) =>
    request(`/incidents/${id}/remark`, { method: "PUT", body: JSON.stringify({ note }) }),
  reassignIncident: (id, newHandlerId, reason) =>
    request(`/incidents/${id}/reassign`, { method: "PUT", body: JSON.stringify({ newHandlerId, reason }) }),
  deleteIncident: (id) => request(`/incidents/${id}`, { method: "DELETE" }),

  // Manuals
  getManuals: (signal) => request("/manuals", { signal }),
  getManual: (id, signal) => request(`/manuals/${id}`, { signal }),
  createManual: (data) => request("/manuals", { method: "POST", body: JSON.stringify(data) }),
  updateManual: (id, data) => request(`/manuals/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteManual: (id) => request(`/manuals/${id}`, { method: "DELETE" }),

  // Fines
  getFines: (params, signal) => request(`/fines${toQuery(params)}`, { signal }),
  getMyFines: (params, signal) => request(`/fines/my${toQuery(params)}`, { signal }),
  getOverdueCount: (signal) => request("/fines/overdue-count", { signal }),
  checkRestriction: (userId) => request(`/fines/check-restriction/${userId}`),
  payFine: (id) => request(`/fines/${id}/pay`, { method: "PUT" }),
  waiveFine: (id, reason) => request(`/fines/${id}/waive`, { method: "PUT", body: JSON.stringify({ reason }) }),

  // Borrow Requests
  getBorrowRequests: (params, signal) => request(`/borrow-requests${toQuery(params)}`, { signal }),
  getMyBorrowRequests: (params, signal) => request(`/borrow-requests/my${toQuery(params)}`, { signal }),
  createBorrowRequest: (data) => request("/borrow-requests", { method: "POST", body: JSON.stringify(data) }),
  approveBorrowRequest: (id, reviewNotes) => request(`/borrow-requests/${id}/approve`, { method: "PUT", body: JSON.stringify({ reviewNotes }) }),
  rejectBorrowRequest: (id, reviewNotes) => request(`/borrow-requests/${id}/reject`, { method: "PUT", body: JSON.stringify({ reviewNotes }) }),
  cancelBorrowRequest: (id) => request(`/borrow-requests/${id}/cancel`, { method: "PUT" }),
  reassignBorrowRequest: (id, data) => request(`/borrow-requests/${id}/reassign`, { method: "PUT", body: JSON.stringify(data) }),

  // Admin Management
  getActiveAdmins: (signal) => request("/admin/active", { signal }),
  toggleAdminStatus: (id) => request(`/admin/${id}/toggle-status`, { method: "PUT" }),

  // Backup
  exportBackup: () => request("/backup/export", { method: "POST" }),
  downloadBackup: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    try {
      const res = await fetch(`${API_URL}/backup/download`, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    }
  },
  importBackup: (backupData, overwrite) => request("/backup/import", { method: "POST", body: JSON.stringify({ backupData, overwrite }) }),
  getBackupHistory: (signal) => request("/backup/history", { signal }),

  // Condition Photo Upload
  uploadConditionPhoto: async (file) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    try {
      const res = await fetch(`${API_URL}/upload/condition-photo`, { method: "POST", headers, body: formData, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
      }
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    }
  },

  // Lab Attendance (kiosk endpoints use kiosk auth)
  lookupStudent: (schoolId) => request(`/attendance/lookup-student/${schoolId}`),
  timeIn: (data) => request("/attendance/time-in", { method: "POST", body: JSON.stringify(data) }),
  timeOut: (data) => request("/attendance/time-out", { method: "POST", body: JSON.stringify(data) }),
  autoScan: (data) => request("/attendance/auto-scan", { method: "POST", body: JSON.stringify(data) }),
  getActiveStudents: (params, signal) => request(`/attendance/active${toQuery(params)}`, { signal }),
  getTodayAttendance: (params, signal) => request(`/attendance/today${toQuery(params)}`, { signal }),
  getAttendanceFacets: (signal) => request("/attendance/facets", { signal }),
  getDailyLog: (date, signal) => request(`/attendance/daily-log/${date}`, { signal }),
// `params` is an already-serialised query string (RoomAttendancePage builds it with
  // URLSearchParams), which is why these interpolate rather than use toQuery -- an
  // OBJECT here would stringify to "[object Object]". getAttendanceHistory is the
  // only endpoint still shaped this way with no caller: the room page replaced it.
  // Kept, because the backend route exists, but it now goes through toQuery so a
  // future caller passing an object gets a correct URL instead of a silent 400.
  getAttendanceHistory: (params, signal) => request(`/attendance/history${toQuery(params)}`, { signal }),
  getRoomAttendanceHistory: (roomId, params, signal) =>
    request(`/attendance/room/${encodeURIComponent(roomId)}/history${toQuery(params)}`, { signal }),
  getStudentAttendance: (schoolId, signal) => request(`/attendance/my/${schoolId}`, { signal }),
  getAttendanceStats: (signal) => request("/attendance/stats", { signal }),
  updateAttendance: (id, data) => request(`/attendance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAttendance: (id) => request(`/attendance/${id}`, { method: "DELETE" }),
  exportAttendance: async (params) => {
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const query = params ? `?${params}` : "";
    let res;
    try {
      res = await fetch(`${API_URL}/attendance/export${query}`, { headers, signal: controller.signal });
    } catch (err) {
      throw new Error(describeNetworkError(err));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const a = document.createElement("a");
    a.href = url;
    a.download = match?.[1] || "lab_attendance.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  },

  // Lab Rooms
  getRooms: (signal) => request("/attendance/rooms", { signal }),
  createRoom: (data) => request("/attendance/rooms", { method: "POST", body: JSON.stringify(data) }),
  updateRoom: (id, data) => request(`/attendance/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRoom: (id) => request(`/attendance/rooms/${id}`, { method: "DELETE" }),
  getRoomQR: (id, signal) => request(`/attendance/rooms/${id}/qr`, { signal }),

  // Student QR
  getStudentQR: (schoolId, signal) => request(`/attendance/student-qr/${schoolId}`, { signal }),



};
